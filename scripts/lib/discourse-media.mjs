const videoMimeTypes = {
  m4v: "video/mp4",
  mov: "video/quicktime",
  mp4: "video/mp4",
  ogv: "video/ogg",
  webm: "video/webm",
}

export const discourseVideoPattern =
  /!\[([^\]]*)\]\(([^)\s]+\.(mp4|webm|mov|m4v|ogv))\)/gi

function escapeHtmlAttribute(value) {
  return value
    .replace(/\|video$/i, "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

export function findDiscourseVideos(markdown) {
  return [...markdown.matchAll(new RegExp(discourseVideoPattern))].map(
    (match) => ({
      label: match[1],
      source: match[2],
    })
  )
}

export function normalizeDiscourseMedia(markdown) {
  return markdown.replace(
    discourseVideoPattern,
    (original, label, source, extension) => {
      const safeLabel = escapeHtmlAttribute(label)
      const mimeType = videoMimeTypes[extension.toLowerCase()]

      return [
        `<video controls preload="metadata" playsinline aria-label="${safeLabel}" style="width: 100%; height: auto;">`,
        `  <source src="${source}" type="${mimeType}">`,
        `  Ваш браузер не підтримує відео. <a href="${source}">Відкрити відеофайл</a>.`,
        "</video>",
      ].join("\n")
    }
  )
}
