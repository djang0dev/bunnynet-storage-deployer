import { FileSystem } from "@effect/platform/FileSystem"
import * as HttpClient from "@effect/platform/HttpClient"
import { ParseError } from "@effect/schema/ParseResult"
import * as S from "@effect/schema/Schema"
import { ConfigError, Effect, Layer, Match, Option, Secret } from "effect"
import { apply } from "effect/Function"
import {
  BUNNY_API_KEY,
  BUNNY_PULL_ZONE_ID,
  BUNNY_STORAGE_NAME,
  BUNNY_STORAGE_ZONE_PASSWORD,
} from "../environments"
import { BunnyEdgeInput, BunnyNetInput, DeployerActionInput } from "../schemas"

import { getRelativePath } from "../utils"
import { ActionGhService } from "./github.service"

export class BunnyConfig extends Effect.Tag("BunnyConfig")<
  BunnyConfig,
  { get: () => Effect.Effect<DeployerActionInput, ConfigError.ConfigError | ParseError, never> }
>() {
  // TODO: Do I need to use `ConfigProvider.make` instead of Schema? this is a bit hacky
  // I guess Config is composable but it seems more used for tokens that are mandatory, rn `accessKey` nor `storagePassword` are
  static fromGh = Layer.effect(
    this,
    Effect.gen(function* () {
      const actionGh = yield* ActionGhService

      // TODO: Less verbose
      const shape = {
        upload: yield* actionGh
          .getCoercedBool({ inputId: "upload" })
          .pipe(Effect.andThen(Option.getOrElse(() => false))),
        remove: yield* actionGh
          .getCoercedBool({ inputId: "remove" })
          .pipe(Effect.andThen(Option.getOrElse(() => false))),
        storageName: yield* actionGh
          .getOptionalInput({
            inputId: "storageName",
          })
          .pipe(Effect.andThen(Option.getOrThrow)),
        storageEndpoint: yield* actionGh
          .getOptionalInput({ inputId: "storageEndpoint" })
          .pipe(Effect.andThen(Option.getOrThrow)),
        storagePassword: yield* actionGh
          .getOptionalInput({ inputId: "storagePassword" })
          .pipe(Effect.andThen(Option.getOrThrow)),

        sourcePattern: yield* actionGh
          .getOptionalInput({ inputId: "sourcePattern" })
          .pipe(Effect.andThen(Option.getOrThrow)),

        destination: yield* actionGh
          .getOptionalInput({ inputId: "destination" })
          .pipe(Effect.andThen(Option.getOrThrow)),

        purgePullZone: yield* actionGh
          .getCoercedBool({ inputId: "purgePullZone" })
          .pipe(Effect.andThen(Option.getOrElse(() => false))),
        pullZoneId: yield* actionGh
          .getOptionalInput({ inputId: "pullZoneId" })
          .pipe(Effect.andThen(Option.getOrThrow)),
        apiKey: yield* actionGh
          .getOptionalInput({ inputId: "apiKey" })
          .pipe(Effect.andThen(Option.getOrThrow)),
        verbose: yield* actionGh
          .getOptionalInput({ inputId: "verbose" })
          .pipe(Effect.andThen(Option.getOrElse(() => false))),
      } as const
      const decoded = yield* S.decodeUnknown(DeployerActionInput, {
        onExcessProperty: "ignore",
        errors: "all",
      })(shape)
      return {
        get: () => Effect.succeed(decoded),
      }
    }),
  )
  static fromTestEnv = Layer.effect(
    this,
    Effect.gen(function* () {
      const bunnyStorageZonePassword = yield* BUNNY_STORAGE_ZONE_PASSWORD
      const bunnyApiKey = yield* BUNNY_API_KEY
      const bunnyStorageName = yield* BUNNY_STORAGE_NAME
      const bunnyPullZoneId = yield* BUNNY_PULL_ZONE_ID
      return {
        get: () =>
          Effect.succeed({
            storageName: bunnyStorageName,
            storageEndpoint: "storage.bunnycdn.com",
            storagePassword: bunnyStorageZonePassword,
            pullZoneId: bunnyPullZoneId,
            remove: true,
            destination: "test/",
            sourcePattern: "./src/samples/**/*.*",
            apiKey: bunnyApiKey,
            purgePullZone: true,
            upload: true,
            verbose: true,
          }),
      }
    }),
  )
}
// TODO: Copycat  https://github.com/Effect-TS/effect/blob/main/packages/effect/src/ConfigError.ts to handle effect tagged errors w/ namespace

export class ObjectNotFoundError extends S.TaggedError<ObjectNotFoundError>()(
  "ObjectNotFoundError",
  {
    objectRelativePath: S.String,
  },
) {}

export class ObjectMutationFailed extends S.TaggedError<ObjectMutationFailed>()(
  "ObjectMutationFailed",
  {
    objectRelativePath: S.String,
  },
) {}

export const makeBunnyEdgeClient = (params: BunnyEdgeInput) =>
  Effect.gen(function* () {
    const basePath = `https://${params.storageEndpoint}/${params.storageName}`
    const getEdgeRelPath = getRelativePath(basePath)
    const fs = yield* FileSystem
    const defaultClient = yield* HttpClient.client.Client
    const baseEdgeBunnyClient = defaultClient.pipe(
      HttpClient.client.filterStatusOk,
      HttpClient.client.mapRequest(
        HttpClient.request.setHeaders({
          AccessKey: Secret.value(params.storagePassword),
          accept: "application/json",
        }),
      ),
      HttpClient.client.mapRequest(
        HttpClient.request.prependUrl(`https://${params.storageEndpoint}/${params.storageName}`),
      ),
    )

    // TODO: map the potential errors from: https://docs.bunny.net/reference/put_-storagezonename-path-filename
    const uploadFile = (relativePath: string, storageBasePath = "") => {
      return baseEdgeBunnyClient.pipe(
        HttpClient.client.mapRequestEffect(HttpClient.request.fileBody(relativePath)),
        apply(HttpClient.request.put(`/${storageBasePath}${relativePath}`)),
        Effect.provide(Layer.effect(FileSystem, Effect.succeed(fs))),
        Effect.scoped,
      )
    }

    const deleteDirectory = (relativeDirectoryPath: string) => {
      return baseEdgeBunnyClient.pipe(
        apply(HttpClient.request.del(`/${relativeDirectoryPath}`)),

        Effect.catchTag("ResponseError", (responseError) => {
          return Effect.gen(function* () {
            const objectRelativePath = getEdgeRelPath(responseError.request.url)
            return yield* Match.value(responseError).pipe(
              Match.when({ reason: "StatusCode" }, (responseError) =>
                Match.value(responseError.response.status).pipe(
                  Match.when(404, () =>
                    Effect.fail(
                      // TODO: I can be more precise whether it's a folder or a file
                      new ObjectNotFoundError({
                        objectRelativePath,
                      }),
                    ),
                  ),
                  Match.when(400, () =>
                    Effect.fail(new ObjectMutationFailed({ objectRelativePath })),
                  ),
                  Match.orElse(() =>
                    Effect.die("Unknown error status used in the response from bunny.net"),
                  ),
                ),
              ),
              Match.orElse(() => Effect.fail(responseError)),
            )
          })
        }),
        Effect.scoped, // Closed at the end in order to get `response.body` which is an "async" op instead of response.status
      )
    }
    return { uploadFile, deleteDirectory } as const
  })

export const makeBunnyNetClient = (params: BunnyNetInput) =>
  Effect.gen(function* () {
    const defaultClient = yield* HttpClient.client.Client
    const baseBunnyNetClient = defaultClient.pipe(
      HttpClient.client.filterStatusOk,
      HttpClient.client.mapRequest(
        HttpClient.request.setHeaders({
          AccessKey: Secret.value(params.apiKey),
          accept: "application/json",
        }),
      ),
      HttpClient.client.mapRequest(HttpClient.request.prependUrl("https://api.bunny.net")),
    )

    const purgeCache = (pullZoneId: string, cacheTag?: string) => {
      return HttpClient.request
        .post(`/pullzone/${pullZoneId}/purgeCache`, {
          headers: cacheTag ? { CacheTag: cacheTag } : {},
        })
        .pipe(baseBunnyNetClient, Effect.scoped)
    }

    return { purgeCache } as const
  })

export class BunnyNetConfig extends Effect.Tag("BunnyNetConfig")<
  BunnyNetConfig,
  Parameters<typeof makeBunnyNetClient>[0]
>() {
  // Context can be from anywhere, gh action, http, cli and so on
  static fromBunnyConfig = Layer.effect(
    this,
    Effect.gen(function* () {
      const { apiKey } = yield* BunnyConfig.get()
      return { apiKey }
    }),
  )
}

export class BunnyNet extends Effect.Tag("BunnyNet")<
  BunnyNet,
  Effect.Effect.Success<ReturnType<typeof makeBunnyNetClient>>
>() {
  static live = Layer.effect(
    this,
    BunnyNetConfig.pipe(
      Effect.flatMap((data) => {
        // Another way to inject a "make factory service"  instead of gen
        return makeBunnyNetClient(data)
      }),
    ).pipe(Effect.provide(Layer.mergeAll(HttpClient.client.layer))),
  )
}

export class BunnyEdgeConfig extends Effect.Tag("BunnyEdgeConfig")<
  BunnyEdgeConfig,
  Parameters<typeof makeBunnyEdgeClient>[0]
>() {
  static fromBunnyConfig = Layer.effect(
    this,
    Effect.gen(function* () {
      const { storagePassword, storageName, storageEndpoint } = yield* BunnyConfig.get()

      return {
        storageEndpoint,
        storagePassword,
        storageName,
      }
    }),
  )
}

export class BunnyEdge extends Effect.Tag("BunnyEdge")<
  BunnyEdge,
  Effect.Effect.Success<ReturnType<typeof makeBunnyEdgeClient>>
>() {
  static live = Layer.effect(
    this,
    Effect.gen(function* () {
      const bunnyConfigEdgeConfig = yield* BunnyEdgeConfig
      return yield* makeBunnyEdgeClient(bunnyConfigEdgeConfig)
    }).pipe(Effect.provide(Layer.mergeAll(HttpClient.client.layer))),
  )
}
