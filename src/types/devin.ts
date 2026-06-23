export type DevinManifestAuthor = {
  name?: string
  email?: string
  url?: string
}

export type DevinManifest = {
  name: string
  version?: string
  description?: string
  author?: DevinManifestAuthor
  homepage?: string
  repository?: string
  license?: string
  keywords?: string[]
}

export type DevinSkillDir = {
  name: string
  sourceDir: string
}

export type DevinBundle = {
  pluginName?: string
  manifest: DevinManifest
  skillDirs: DevinSkillDir[]
}
