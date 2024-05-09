import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer, Schedule, pipe } from "effect"
import * as Arr from "effect/Array"
import { hardScheduleRetrying, softScheduleRetrying } from "./schedulings"
import {
  BunnyConfig,
  BunnyEdge,
  BunnyEdgeConfig,
  BunnyNet,
  BunnyNetConfig,
} from "./services/bunny.services"
import { FilesService } from "./services/files.service"
import { ActionGhService } from "./services/github.service"

const bunnyStorageDeployerProgram = Effect.gen(function* (_) {
  const bunnyConfig = yield* BunnyConfig.get()
  const { verbose } = bunnyConfig
  if (bunnyConfig.remove || bunnyConfig.upload) {
    const bunnyEdgeClient = yield* BunnyEdge
    if (bunnyConfig.remove) {
      if (verbose)
        yield* Effect.log(`Starting flushing folder destination ${bunnyConfig.destination}`)
      yield* bunnyEdgeClient.deleteDirectory(bunnyConfig.destination).pipe(
        Effect.catchTags({
          ObjectNotFoundError: (e) =>
            pipe(
              Effect.fail(e), // Catching and directly failing in order to fire the `retryOrElse` maybe there's a better pattern?
              Effect.retryOrElse(
                softScheduleRetrying.pipe(
                  Schedule.tapOutput(([, iteration]) => {
                    // Better to put verbose as a `BunnyEdgeConfig` props?
                    if (verbose)
                      return Effect.logWarning(`Trying object deletion, iteration: ${iteration}`)
                    return Effect.void
                  }),
                ),
                (e) =>
                  pipe(
                    Effect.logWarning(
                      `destination ${e.objectRelativePath} object not found, skipping`,
                      Effect.void,
                    ),
                  ),
              ),
            ),
          ObjectMutationFailed: (e) => pipe(Effect.fail(e), Effect.retry(hardScheduleRetrying)),
        }),
        Effect.tap(Effect.log(`Directory destination ${bunnyConfig.destination} flushed`)),
      )
    }

    if (bunnyConfig.upload) {
      const files = yield* FilesService.findGlob(bunnyConfig.sourcePattern)
      yield* pipe(
        Effect.succeed(files),
        Effect.flatMap((filePaths) =>
          Effect.if(Arr.isEmptyArray(filePaths), {
            onTrue: () => {
              return pipe(
                Effect.void,
                Effect.tap(
                  Effect.logWarning(
                    `No files found for source pattern: ${bunnyConfig.sourcePattern}, skipping`, // error?
                  ),
                ),
              )
            },
            onFalse: () =>
              pipe(
                filePaths,
                Effect.forEach(
                  (relativePath) =>
                    bunnyEdgeClient
                      .uploadFile(relativePath, bunnyConfig.destination)
                      .pipe(
                        Effect.catchAll((e) =>
                          pipe(Effect.fail(e), Effect.retry(hardScheduleRetrying)),
                        ),
                      ),
                  {
                    concurrency: 50, // limit, see: https://docs.bunny.net/reference/edge-storage-api-limits
                    batching: true,
                  },
                ),
                Effect.tap(
                  Effect.log(
                    `${filePaths.length} files uploaded to bunny storage: ${bunnyConfig.storageName}`,
                  ),
                ),
              ),
          }),
        ),
      )
    }
  }

  if (bunnyConfig.purgePullZone) {
    yield* pipe(
      BunnyNet.purgeCache(bunnyConfig.pullZoneId),
      Effect.tap(Effect.log(`Bunny pullZone id:${bunnyConfig.pullZoneId} purged`)),
    )
  }
})
// const MergedLayerTest = Layer.mergeAll(
//   FilesService.Live,
//   BunnyConfig.fromTestEnv,
//   BunnyEdge.live.pipe(
//     Layer.provide(BunnyEdgeConfig.fromBunnyConfig.pipe(Layer.provide(BunnyConfig.fromTestEnv))),
//   ),
//   BunnyNet.live.pipe(
//     Layer.provide(BunnyNetConfig.fromBunnyConfig.pipe(Layer.provide(BunnyConfig.fromTestEnv))),
//   ),
// )
const bunnyConfigFromGh = BunnyConfig.fromGh.pipe(Layer.provide(ActionGhService.live))
const MergedLayerLive = Layer.mergeAll(
  FilesService.Live,
  bunnyConfigFromGh,
  BunnyEdge.live.pipe(
    Layer.provide(BunnyEdgeConfig.fromBunnyConfig.pipe(Layer.provide(bunnyConfigFromGh))),
  ),
  BunnyNet.live.pipe(
    Layer.provide(BunnyNetConfig.fromBunnyConfig.pipe(Layer.provide(bunnyConfigFromGh))),
  ),
)

const programLive = bunnyStorageDeployerProgram.pipe(Effect.provide(MergedLayerLive))

NodeRuntime.runMain(programLive.pipe(Effect.provide(NodeContext.layer)))
