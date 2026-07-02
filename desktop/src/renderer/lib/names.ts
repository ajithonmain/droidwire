// "photo.jpg" -> "photo (2).jpg" until the name is free in existingNames
export function uniqueDestName(baseName: string, existingNames: Set<string>): string {
  if (!existingNames.has(baseName)) return baseName
  const dot = baseName.lastIndexOf('.')
  const namePart = dot > 0 ? baseName.slice(0, dot) : baseName
  const extPart = dot > 0 ? baseName.slice(dot) : ''
  let n = 2
  while (existingNames.has(`${namePart} (${n})${extPart}`)) n++
  return `${namePart} (${n})${extPart}`
}
