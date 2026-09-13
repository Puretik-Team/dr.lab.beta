/**
 * Uploads the Windows NSIS installer + latest.yml (produced by
 * `electron-builder --win` into ./out) to Linode Object Storage, so
 * electron-updater's generic provider (see package.json "build.publish",
 * url: https://drlab.us-east-1.linodeobjects.com/release/${os}) can serve
 * auto-updates.
 *
 * Renames "Dr.Lab Setup {version}.exe" -> "Dr.Lab-Setup-{version}.exe" on
 * upload (spaces are unsafe in a URL electron-updater will fetch verbatim).
 *
 * Required env vars: LINODE_ACCESS_KEY_ID, LINODE_SECRET_ACCESS_KEY
 * (falls back to AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY if unset).
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const aws4 = require("aws4");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const REGION = "us-east-1";
const BUCKET = "drlab";
const HOST = `${BUCKET}.${REGION}.linodeobjects.com`;
const OS_KEY = "win"; // matches ${os} in the generic publish url for Windows
const OUT_DIR = process.env.OUT_DIR || path.join(__dirname, "..", "out");

const accessKeyId = process.env.LINODE_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.LINODE_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

if (!accessKeyId || !secretAccessKey) {
  console.error(
    "Missing credentials. Set LINODE_ACCESS_KEY_ID and LINODE_SECRET_ACCESS_KEY (or AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)."
  );
  process.exit(1);
}

const { version } = require("../package.json");

function findInstaller() {
  const files = fs.readdirSync(OUT_DIR);
  const exe = files.find((f) => f.endsWith(".exe") && f.includes(version) && /setup/i.test(f));
  if (!exe) {
    throw new Error(`Could not find a "*Setup*${version}*.exe" installer in ${OUT_DIR}`);
  }
  return exe;
}

function uploadFile(localPath, remoteKey, contentType) {
  return new Promise((resolve, reject) => {
    const body = fs.readFileSync(localPath);
    const opts = aws4.sign(
      {
        host: HOST,
        method: "PUT",
        path: `/${encodeURIComponent(remoteKey)}`,
        region: REGION,
        service: "s3",
        headers: {
          "Content-Type": contentType,
          "Content-Length": body.length,
          "x-amz-acl": "public-read",
        },
        body,
      },
      { accessKeyId, secretAccessKey }
    );

    const req = https.request(
      { ...opts, protocol: "https:" },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`Uploaded ${remoteKey} (${res.statusCode})`);
            resolve();
          } else {
            reject(new Error(`Upload of ${remoteKey} failed: ${res.statusCode} ${data}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    throw new Error(`Output directory not found: ${OUT_DIR}. Run "npm run package:win" first.`);
  }

  const installerName = findInstaller();
  const uploadName = installerName.replace(/ /g, "-");
  const latestYmlPath = path.join(OUT_DIR, "latest.yml");

  if (!fs.existsSync(latestYmlPath)) {
    throw new Error(`latest.yml not found in ${OUT_DIR}. Run "npm run package:win" first.`);
  }

  console.log(`Uploading release ${version} to https://${HOST}/release/${OS_KEY}/ ...`);

  await uploadFile(
    path.join(OUT_DIR, installerName),
    `release/${OS_KEY}/${uploadName}`,
    "application/x-msdownload"
  );
  await uploadFile(latestYmlPath, `release/${OS_KEY}/latest.yml`, "text/yaml");

  console.log("Done.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
