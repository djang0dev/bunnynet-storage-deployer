export const getRelativePath = (basePath: string) => (fullPath: string) => {
  return fullPath.replaceAll(`${basePath}/`, "")
}
