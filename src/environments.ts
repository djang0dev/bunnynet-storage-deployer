import { Config } from "effect"

export const BUNNY_STORAGE_ZONE_PASSWORD = Config.secret("BUNNY_STORAGE_ZONE_PASSWORD")
export const BUNNY_API_KEY = Config.secret("BUNNY_API_KEY")
export const BUNNY_PULL_ZONE_ID = Config.string("BUNNY_PULL_ZONE_ID")
export const BUNNY_STORAGE_NAME = Config.string("BUNNY_STORAGE_NAME")
