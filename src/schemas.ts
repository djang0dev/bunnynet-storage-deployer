import * as S from "@effect/schema/Schema"

export const BunnyDeployerSteps = S.Struct({
  remove: S.Boolean,
  upload: S.Boolean,
  purgePullZone: S.Boolean,
})

export type BunnyDeployerSteps = S.Schema.Type<typeof BunnyDeployerSteps>

export const BunnyEdgeInput = S.Struct({
  storageName: S.String,
  storageEndpoint: S.String,
  storagePassword: S.Secret,
})

export type BunnyEdgeInput = S.Schema.Type<typeof BunnyEdgeInput>

export const BunnyDeployStorageInput = S.Struct({
  destination: S.String,
  sourcePattern: S.String,
})

export const BunnyFlushPzInput = S.Struct({
  pullZoneId: S.String,
})

export type BunnyDeployStorageInput = S.Schema.Type<typeof BunnyDeployStorageInput>

export const BunnyNetInput = S.Struct({
  apiKey: S.Secret,
})

export const DeployerActionInput = S.Struct({
  ...BunnyEdgeInput.fields,
  ...BunnyDeployStorageInput.fields,
  ...BunnyNetInput.fields,
  ...BunnyFlushPzInput.fields,
  verbose: S.optional(S.Boolean, { default: () => false }),
}).pipe(S.extend(BunnyDeployerSteps))

export type DeployerActionInput = S.Schema.Type<typeof DeployerActionInput>

export type BunnyNetInput = S.Schema.Type<typeof BunnyNetInput>
