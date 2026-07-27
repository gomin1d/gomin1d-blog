import fs from "node:fs"
import path from "node:path"
import readline from "node:readline"
import zlib from "node:zlib"
import { normalizeDiscourseMedia } from "./lib/discourse-media.mjs"

const projectRoot = process.cwd()
const backupRoot = path.resolve(
  projectRoot,
  process.argv[2] ?? "discord-backup-extracted"
)
const dumpPath = path.join(backupRoot, "dump.sql.gz")
const writingsRoot = path.join(
  projectRoot,
  "src",
  "content",
  "writings",
  "discourse"
)
const uploadSource = path.join(
  backupRoot,
  "uploads",
  "default",
  "original",
  "1X"
)
const uploadTarget = path.join(
  projectRoot,
  "public",
  "discourse-uploads"
)
const markerName = ".generated-by-discourse-migration.json"

if (!fs.existsSync(dumpPath)) {
  console.error(`Discourse dump not found: ${dumpPath}`)
  process.exit(1)
}

const selectedTables = new Set([
  "categories",
  "posts",
  "tags",
  "topic_tags",
  "topics",
  "uploads",
  "users",
])

const tables = new Map()

function decodeCopyValue(value) {
  if (value === String.raw`\N`) return null

  let decoded = ""
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character !== "\\") {
      decoded += character
      continue
    }

    const escaped = value[index + 1]
    index += 1

    const replacements = {
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
      v: "\v",
      "\\": "\\",
    }

    if (escaped in replacements) {
      decoded += replacements[escaped]
      continue
    }

    if (escaped === "x") {
      const match = value.slice(index + 1).match(/^[0-9a-fA-F]{1,2}/)
      if (match) {
        decoded += String.fromCharCode(Number.parseInt(match[0], 16))
        index += match[0].length
        continue
      }
    }

    if (/[0-7]/.test(escaped ?? "")) {
      const match = value.slice(index).match(/^[0-7]{1,3}/)
      decoded += String.fromCharCode(Number.parseInt(match[0], 8))
      index += match[0].length - 1
      continue
    }

    decoded += escaped ?? "\\"
  }

  return decoded
}

function parseCopyRow(line, columns) {
  const values = line.split("\t").map(decodeCopyValue)
  return Object.fromEntries(columns.map((column, index) => [column, values[index]]))
}

async function readDump() {
  const input = fs.createReadStream(dumpPath).pipe(zlib.createGunzip())
  const lines = readline.createInterface({ input, crlfDelay: Infinity })
  let currentTable = null
  let currentColumns = []

  for await (const line of lines) {
    if (currentTable) {
      if (line === String.raw`\.`) {
        currentTable = null
        currentColumns = []
      } else {
        tables.get(currentTable).push(parseCopyRow(line, currentColumns))
      }
      continue
    }

    const copy = line.match(/^COPY public\.([^ ]+) \((.*)\) FROM stdin;$/)
    if (!copy || !selectedTables.has(copy[1])) continue

    currentTable = copy[1]
    currentColumns = copy[2].split(", ").map((column) =>
      column.replace(/^"|"$/g, "")
    )
    tables.set(currentTable, [])
  }
}

function byId(rows) {
  return new Map(rows.map((row) => [row.id, row]))
}

function groupBy(rows, key) {
  const grouped = new Map()
  for (const row of rows) {
    const value = row[key]
    if (!grouped.has(value)) grouped.set(value, [])
    grouped.get(value).push(row)
  }
  return grouped
}

function slugify(value) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яіїєґ]+/giu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)

  return slug || "topic"
}

function formatTimestamp(value) {
  if (!value) return "невідомий час"
  return `${value.replace(" ", "T").replace(/\+00$/, "Z")} UTC`
    .replace("T", " ")
    .replace(/Z UTC$/, " UTC")
}

function yamlString(value) {
  return JSON.stringify(value ?? "")
}

function escapeCommentText(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")
}

function encodeBase62(hex, alphabet) {
  const normalizedHex = hex.replace(/[^0-9a-f]/gi, "").slice(-40)
  if (!normalizedHex) return ""

  let number = BigInt(`0x${normalizedHex}`)
  if (number === 0n) return alphabet[0]

  let encoded = ""
  while (number > 0n) {
    encoded = alphabet[Number(number % 62n)] + encoded
    number /= 62n
  }
  return encoded
}

function prepareGeneratedDirectory(directory) {
  if (fs.existsSync(directory)) {
    const marker = path.join(directory, markerName)
    if (!fs.existsSync(marker)) {
      throw new Error(
        `Refusing to replace an unmarked directory: ${directory}`
      )
    }
    fs.rmSync(directory, { recursive: true, force: true })
  }
  fs.mkdirSync(directory, { recursive: true })
}

function writeMarker(directory, details) {
  fs.writeFileSync(
    path.join(directory, markerName),
    `${JSON.stringify(details, null, 2)}\n`
  )
}

function createUploadRewriter(uploads) {
  const lookup = new Map()
  const alphabets = [
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ]

  for (const upload of uploads) {
    if (!upload.sha1 || !upload.url) continue
    const filename = path.basename(upload.url.replaceAll("\\", "/"))
    for (const alphabet of alphabets) {
      lookup.set(encodeBase62(upload.sha1, alphabet), filename)
    }
  }

  return (markdown) => {
    let rewritten = markdown

    rewritten = rewritten.replace(
      /upload:\/\/([A-Za-z0-9]+)(\.[A-Za-z0-9]+)?/g,
      (original, token) => {
        const filename = lookup.get(token)
        return filename ? `/discourse-uploads/${filename}` : original
      }
    )

    rewritten = rewritten.replace(
      /(?:https?:\/\/[^)\s"'<>]+)?\/uploads\/default\/original\/1X\/([A-Za-z0-9._-]+)/g,
      "/discourse-uploads/$1"
    )

    return rewritten
  }
}

function rewriteInternalTopicLinks(markdown, topicRoutes) {
  return markdown.replace(
    /https?:\/\/(?:www\.)?gomin1d\.top\/t\/[^/\s)]+\/(\d+)(?:\/\d+)?/g,
    (original, topicId) => topicRoutes.get(topicId) ?? original
  )
}

await readDump()

const categories = byId(tables.get("categories") ?? [])
const users = byId(tables.get("users") ?? [])
const tags = byId(tables.get("tags") ?? [])
const postsByTopic = groupBy(tables.get("posts") ?? [], "topic_id")
const topicTags = groupBy(tables.get("topic_tags") ?? [], "topic_id")
const topics = tables.get("topics") ?? []
const uploads = tables.get("uploads") ?? []
const rewriteUploads = createUploadRewriter(uploads)

prepareGeneratedDirectory(writingsRoot)
prepareGeneratedDirectory(uploadTarget)

if (fs.existsSync(uploadSource)) {
  fs.cpSync(uploadSource, uploadTarget, {
    recursive: true,
    force: true,
  })
}

const statistics = {
  generatedAt: new Date().toISOString(),
  source: path.relative(projectRoot, dumpPath),
  articles: 0,
  comments: 0,
  skipped: {
    privateOrNonRegular: 0,
    restrictedCategory: 0,
    deletedOrInvisible: 0,
    missingFirstPost: 0,
  },
  unresolvedUploadLinks: 0,
}

const publicTopics = topics
  .filter((topic) => {
    if (topic.archetype !== "regular") {
      statistics.skipped.privateOrNonRegular += 1
      return false
    }
    if (topic.deleted_at || topic.visible !== "t") {
      statistics.skipped.deletedOrInvisible += 1
      return false
    }
    const category = categories.get(topic.category_id)
    if (category?.read_restricted === "t") {
      statistics.skipped.restrictedCategory += 1
      return false
    }
    return true
  })
  .sort((left, right) => Number(left.id) - Number(right.id))

const topicRoutes = new Map(
  publicTopics.map((topic) => {
    const filename = `${topic.id}-${slugify(topic.slug || topic.title)}`
    return [topic.id, `/writings/discourse/${filename}`]
  })
)

for (const topic of publicTopics) {
  const posts = (postsByTopic.get(topic.id) ?? [])
    .filter(
      (post) =>
        !post.deleted_at &&
        post.post_type === "1" &&
        post.hidden !== "t" &&
        post.user_deleted !== "t"
    )
    .sort((left, right) => Number(left.post_number) - Number(right.post_number))

  const firstPost = posts.find((post) => post.post_number === "1")
  if (!firstPost) {
    statistics.skipped.missingFirstPost += 1
    continue
  }

  const comments = posts.filter((post) => post.post_number !== "1")
  const assignedTags = (topicTags.get(topic.id) ?? [])
    .map((topicTag) => tags.get(topicTag.tag_id)?.name)
    .filter(Boolean)

  let body = normalizeDiscourseMedia(
    rewriteInternalTopicLinks(
      rewriteUploads(firstPost.raw ?? ""),
      topicRoutes
    )
  ).trim()
  const commentSections = comments.map((comment) => {
    const username = users.get(comment.user_id)?.username ?? "видалений користувач"
    const text = rewriteInternalTopicLinks(
      rewriteUploads(comment.raw ?? ""),
      topicRoutes
    ).trim()
    return `**${username} — ${formatTimestamp(comment.created_at)}**\n\n${escapeCommentText(text)}`
  })

  const footer = [
    "---",
    "",
    `_Опубліковано на Discourse: ${formatTimestamp(topic.created_at)}_`,
  ]

  if (commentSections.length > 0) {
    footer.push(
      "",
      "## Коментарі з Discourse",
      "",
      commentSections.join("\n\n---\n\n")
    )
  }

  body = `${body}\n\n${footer.join("\n")}\n`
  statistics.unresolvedUploadLinks += (body.match(/upload:\/\//g) ?? []).length

  const frontmatter = [
    "---",
    `title: ${yamlString(topic.title)}`,
    `date: ${yamlString(topic.created_at)}`,
    `tags: ${JSON.stringify(assignedTags)}`,
    "draft: false",
    "---",
    "",
  ].join("\n")

  const filename = `${topic.id}-${slugify(topic.slug || topic.title)}.md`
  fs.writeFileSync(
    path.join(writingsRoot, filename),
    `${frontmatter}${body}`,
    "utf8"
  )

  statistics.articles += 1
  statistics.comments += comments.length
}

writeMarker(writingsRoot, statistics)
writeMarker(uploadTarget, {
  generatedAt: statistics.generatedAt,
  source: path.relative(projectRoot, uploadSource),
  files: fs.readdirSync(uploadTarget).filter((name) => name !== markerName).length,
})

console.log(`Migrated ${statistics.articles} Discourse articles.`)
console.log(`Appended ${statistics.comments} comments.`)
console.log(
  `Copied ${fs.readdirSync(uploadTarget).filter((name) => name !== markerName).length} uploads.`
)
console.log(
  `Unresolved upload:// links: ${statistics.unresolvedUploadLinks}.`
)
console.log(`Articles: ${path.relative(projectRoot, writingsRoot)}`)
console.log(`Uploads: ${path.relative(projectRoot, uploadTarget)}`)
