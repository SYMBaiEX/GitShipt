import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  // PWA manifests require literal color strings. Keep this in sync with the
  // canonical dark `--bg` token exported by DESIGN.md / theme scripts.
  const canonicalDarkBg = "rgb(8, 8, 12)";
  return {
    name: "GitShipt",
    short_name: "GitShipt",
    description:
      "Launch Bags.fm tokens for GitHub repos and route fees to contributors.",
    start_url: "/",
    display: "standalone",
    background_color: canonicalDarkBg,
    theme_color: canonicalDarkBg,
    icons: [
      {
        src: "/logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
