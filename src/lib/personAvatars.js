// Person avatars mapping codes to avatar URLs and metadata
export const PERSON_AVATARS = {
  DJ: {
    name: "Dee",
    image: "https://media.base44.com/images/public/69d4e29f22a8078c11a10f41/c312fb3f3_Screenshot2026-04-10at135526.png",
  },
  CB: {
    name: "Céline",
    image: "https://media.base44.com/images/public/69d4e29f22a8078c11a10f41/a670e1c19_Screenshot2026-04-10at135511.png",
  },
  ST: {
    name: "Sophie",
    image: "https://media.base44.com/images/public/69d4e29f22a8078c11a10f41/0ed339e2e_Screenshot2026-04-10at135502.png",
  },
};

export function getPersonAvatar(code) {
  return PERSON_AVATARS[code] || null;
}