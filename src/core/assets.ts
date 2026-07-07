// Built-in artwork manifests — mirror public/images/. Add files there,
// list them here. Path-based srcs are tiny, so unlike uploads they stay
// in share links.
export const PEOPLE_IMAGES = [
  'original_0253aae64e02d8dca52290883c17af13.jpg',
  'original_245799fae0e95c55ffd148eda712ab22.jpg',
  'original_530deb512207dec4580e959b8b49c75f.jpg',
  'original_61b003cbcdeec60d83fe426f37cb94d9.jpg',
  'original_68d1644ec0f7e8d81cf738b9f396d2ee.jpg',
  'original_6a5133b7a6258e1a6575102a6ff56908.jpg',
  'original_78515501f37aca5cfaff7ba4abf260a3.jpg',
  'original_a5c5ac7b1142a891a5c968d254a16a9f.jpg',
  'original_aab4a7dad51fca7fdb51a19e79b2cfca.jpg',
  'original_b699c67cc929cdc72450593881cbda7f.jpg',
  'original_ea53730cdd633b32ed2025db27ac45e0.jpg',
  'original_f68bd0a2432dbe73da0e05d5cf6b334a.jpg',
  'original_ff4289e6f1aa4702c17da1d3b6cde78e.jpg',
].map((f) => `/images/people/${f}`)

export const BACKGROUND_IMAGES = [
  'original_25eb24d7db72f6d6d96eb50d8cb41de9.png',
  'original_2a4d0fa4ddebab34858123a11ce46cbc.webp',
  'original_36b1351c71af5172cc38585d7ace70c3.jpg',
  'original_97616ca65066bdd7632d74489942ea17.png',
].map((f) => `/images/backgrounds/${f}`)

// stable image-item id for a built-in background path
export function builtinBgId(path: string): string {
  return `bgi-${path.split('/').pop()}`
}
