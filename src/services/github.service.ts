import * as core from "@actions/core"
import * as S from "@effect/schema/Schema"
import { Effect, Layer, Option, flow } from "effect"

export class GhInputError extends S.TaggedError<GhInputError>()("GhInputError", {
  inputId: S.String,
  error: S.Unknown,
}) {}
export class GhInputNotFound extends S.TaggedError<GhInputNotFound>()("GhInputNotFound", {
  inputId: S.String,
}) {}
const makeActionGhService = () =>
  Effect.gen(function* () {
    const getInput = ({
      inputId,
      canBeFalsy,
    }: {
      inputId: string
      canBeFalsy?: boolean
    }) => {
      return Effect.try({
        try: () => core.getInput(inputId) as string | undefined,
        catch: (e) => {
          return new GhInputError({ inputId, error: e })
        },
      }).pipe(
        Effect.flatMap((inputValue) =>
          Effect.if(canBeFalsy || Boolean(inputValue), {
            onTrue: () => Effect.succeed(inputValue),
            onFalse: () => Effect.fail(new GhInputNotFound({ inputId })),
          }),
        ),
      )
    }

    const getOptionalInput = flow(
      getInput,
      Effect.catchTag("GhInputNotFound", () => {
        return Option.none()
      }),
      Effect.flatMap((el) => {
        return Effect.if(el === undefined, {
          onTrue: () => Option.none(),
          onFalse: () => Option.some(el as string),
        })
      }),
      Effect.optionFromOptional,
    )

    const getCoercedBool = flow(
      getOptionalInput,
      Effect.andThen((el) => {
        return Option.match(el, {
          onSome: (el) => {
            return Option.some(el.toLowerCase() === "true")
          },
          onNone: () => Option.none(),
        })
      }),
      Effect.optionFromOptional,
    )

    return { getInput, getOptionalInput, getCoercedBool } as const
  })
export const ActionGhService = class ActionGhService extends Effect.Tag("ActionGhService")<
  ActionGhService,
  Effect.Effect.Success<ReturnType<typeof makeActionGhService>>
>() {
  static live = Layer.effect(
    this,
    Effect.suspend(() => makeActionGhService()),
  )
}
