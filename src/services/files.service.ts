import { FileSystem } from "@effect/platform/FileSystem"
import { Effect, Layer, pipe } from "effect"
import { glob } from "glob"

import * as S from "@effect/schema/Schema"

export class GlobError extends S.TaggedError<GlobError>()("GlobError", {}) {}

export const filesMake = () => {
  const findGlob = (stringRegex: string) =>
    Effect.gen(function* (_) {
      const fs = yield* FileSystem
      const filePaths = yield* pipe(
        Effect.tryPromise({
          try: (signal) => glob(stringRegex, { dot: true, fs: fs, signal: signal }),
          catch: () => new GlobError("Unable to retrieve files path"),
        }),
      )
      return filePaths
    })

  return { findGlob } as const
}

export class FilesService extends Effect.Tag("FilesService")<
  FilesService,
  ReturnType<typeof filesMake>
>() {
  static Live = Layer.effect(this, Effect.sync(filesMake))
}
