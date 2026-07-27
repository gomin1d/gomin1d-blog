import fs from "node:fs"
import path from "node:path"
import {
  findDiscourseVideos,
  normalizeDiscourseMedia,
} from "./lib/discourse-media.mjs"

const checkOnly = process.argv.includes("--check")
const contentRoot = path.resolve(
  process.cwd(),
  "src",
  "content",
  "writings",
  "discourse"
)

function markdownFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return markdownFiles(entryPath)
    return entry.isFile() && entry.name.endsWith(".md") ? [entryPath] : []
  })
}

if (!fs.existsSync(contentRoot)) {
  console.error(`Discourse content directory not found: ${contentRoot}`)
  process.exit(1)
}

const affected = []
let videoCount = 0

for (const filePath of markdownFiles(contentRoot)) {
  const markdown = fs.readFileSync(filePath, "utf8")
  const videos = findDiscourseVideos(markdown)
  if (videos.length === 0) continue

  affected.push(path.relative(process.cwd(), filePath))
  videoCount += videos.length

  if (!checkOnly) {
    fs.writeFileSync(filePath, normalizeDiscourseMedia(markdown), "utf8")
  }
}

if (affected.length === 0) {
  console.log("No image-style video embeds found.")
  process.exit(0)
}

const action = checkOnly ? "Found" : "Fixed"
console.log(`${action} ${videoCount} video embeds in ${affected.length} files:`)
for (const filePath of affected) console.log(`- ${filePath}`)

if (checkOnly) process.exit(1)
