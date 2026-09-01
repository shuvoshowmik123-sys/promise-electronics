/**
 * Package the web build as an over-the-air bundle.
 *
 * This zip is what lets a fix reach a phone without anyone downloading an APK.
 * It is the same dist/public that gets compiled into the app, published beside
 * the APK on the release; the app fetches it, stages it, and opens on it next
 * launch.
 *
 *   npm run build && npm run app:bundle
 *
 * Then attach the zip to the same release as the APK. The tag is the version
 * both are compared against, so they move together.
 *
 * The zip's contents must sit at the root — index.html at the top level, not
 * inside a folder — because that is where the updater looks for it. Zipping the
 * directory instead of its contents produces an archive that downloads happily
 * and then fails to start.
 *
 * Built with archiver rather than PowerShell's Compress-Archive, and that is
 * not a preference. Compress-Archive writes Windows separators into the entry
 * names — "assets\index.js" — where the ZIP specification requires forward
 * slashes. Java's unzip, which is what Android uses, then reads that as one
 * oddly-named file at the top level rather than a folder of assets. The archive
 * looks correct on Windows, downloads correctly, and unpacks into a bundle with
 * no assets directory at all: a white screen on every phone, caught only by the
 * rollback. The first version of this script did exactly that.
 */

import { createWriteStream, existsSync, readFileSync, promises as fsp } from "fs";
import { mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import archiver from "archiver";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "dist", "public");
const outDir = join(root, "dist", "bundles");

if (!existsSync(join(source, "index.html"))) {
    console.error("No dist/public/index.html — run `npm run build` first.");
    process.exit(1);
}

/**
 * The version comes from the Android build, not package.json.
 *
 * versionName is what the app reports about itself and what the release tag
 * matches, so taking it from anywhere else invites a bundle that claims to be a
 * version nothing else agrees with.
 */
const gradle = readFileSync(join(root, "android", "app", "build.gradle"), "utf8");
const version = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
if (!version) {
    console.error("Could not read versionName from android/app/build.gradle.");
    process.exit(1);
}

await mkdir(outDir, { recursive: true });
const outFile = join(outDir, `PromiseStaffWeb-${version}.zip`);

await new Promise((resolve, reject) => {
    const out = createWriteStream(outFile);
    const archive = archiver("zip", { zlib: { level: 9 } });

    out.on("close", resolve);
    archive.on("warning", (err) => {
        if (err.code === "ENOENT") console.warn(err.message);
        else reject(err);
    });
    archive.on("error", reject);

    archive.pipe(out);
    // `false` is what places the contents at the root of the archive instead of
    // nesting them under a directory name.
    archive.directory(source, false);
    archive.finalize();
});

const { size } = await fsp.stat(outFile);
console.log(`\n  ${outFile}`);
console.log(`  ${(size / 1024 / 1024).toFixed(2)} MB  ·  version ${version}`);
console.log(`\n  Attach this to the v${version} release, beside the APK.\n`);
