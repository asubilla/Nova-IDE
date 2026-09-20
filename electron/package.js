const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const WEB = path.join(ROOT, "web");
const ELECTRON_DIR = __dirname;
const RELEASE = path.join(ROOT, "release");

function getPackageConfig() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  const iconDir = path.join(ELECTRON_DIR, "assets");
  const winIcon = fs.existsSync(path.join(iconDir, "icon.ico")) ? path.join(iconDir, "icon.ico") : undefined;
  const macIcon = fs.existsSync(path.join(iconDir, "icon.icns")) ? path.join(iconDir, "icon.icns") : undefined;
  const linuxIcon = fs.existsSync(path.join(iconDir, "icon.png")) ? path.join(iconDir, "icon.png") : undefined;
  return {
    appId: "com.nova.ide",
    productName: "Nova IDE",
    version: pkg.version || "1.0.0",
    description: pkg.description || "Nova Sub-Agent IDE",
    author: pkg.author || "Nova Team",
    license: pkg.license || "MIT",
    directories: {
      output: RELEASE,
      app: path.join(RELEASE, "app"),
    },
    files: [
      "dist/**/*",
      "web/**/*",
      "electron/main.js",
      "electron/preload.js",
      "package.json",
    ],
    win: {
      target: "dir",
      icon: winIcon,
      artifactName: "${productName}-${version}-win-${arch}.${ext}",
    },
    mac: {
      target: "dir",
      icon: macIcon,
      artifactName: "${productName}-${version}-mac-${arch}.${ext}",
      category: "public.app-category.developer-tools",
    },
    linux: {
      target: "dir",
      icon: linuxIcon,
      artifactName: "${productName}-${version}-linux-${arch}.${ext}",
      category: "Development",
    },
  };
}

function writePackageJson() {
  const config = getPackageConfig();
  const electronPkg = {
    name: config.appId,
    version: config.version,
    description: config.description,
    author: config.author,
    license: config.license,
    main: "electron/main.js",
    productName: config.productName,
  };

  const outPath = path.join(RELEASE, "app", "package.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(electronPkg, null, 2), "utf-8");
  console.log(`Wrote electron package.json to ${outPath}`);
  return outPath;
}

function copyFiles() {
  const appDir = path.join(RELEASE, "app");
  fs.mkdirSync(appDir, { recursive: true });

  if (fs.existsSync(DIST)) {
    const distDest = path.join(appDir, "dist");
    fs.cpSync(DIST, distDest, { recursive: true });
    console.log("Copied dist/");
  }

  if (fs.existsSync(WEB)) {
    const webDest = path.join(appDir, "web");
    fs.cpSync(WEB, webDest, { recursive: true });
    console.log("Copied web/");
  }

  const mainSrc = path.join(ELECTRON_DIR, "main.ts");
  const mainDest = path.join(appDir, "electron", "main.js");
  if (fs.existsSync(mainSrc)) {
    const compiled = execSync(`npx tsc "${mainSrc}" --outDir "${path.join(appDir, "electron")}" --target ES2020 --module commonjs --skipLibCheck`, {
      cwd: ROOT,
      encoding: "utf-8",
    });
    console.log("Compiled electron/main.ts");
  }

  const preloadSrc = path.join(ELECTRON_DIR, "preload.ts");
  if (fs.existsSync(preloadSrc)) {
    execSync(`npx tsc "${preloadSrc}" --outDir "${path.join(appDir, "electron")}" --target ES2020 --module commonjs --skipLibCheck`, {
      cwd: ROOT,
      encoding: "utf-8",
    });
    console.log("Compiled electron/preload.ts");
  }

  fs.cpSync(path.join(ROOT, "package.json"), path.join(appDir, "package.json"));
  fs.cpSync(path.join(ROOT, "package-lock.json"), path.join(appDir, "package-lock.json"), { force: true });
  console.log("Copied root package files");
}

async function packageForWindows() {
  const config = getPackageConfig();
  console.log("Packaging for Windows...");
  copyFiles();
  writePackageJson();

  const { packager } = require("@electron/packager");
  const opts = {
    dir: path.join(RELEASE, "app"),
    out: RELEASE,
    name: config.productName,
    platform: "win32",
    arch: "x64",
    overwrite: true,
    asar: true,
    win32metadata: {
      CompanyName: config.author,
      FileDescription: config.description,
      OriginalFilename: `${config.productName}.exe`,
      ProductName: config.productName,
    },
  };
  if (config.win.icon) opts.icon = config.win.icon;
  const result = await packager(opts);
  console.log(`Windows build complete: ${result.join(", ")}`);
  return result;
}

async function packageForMac() {
  const config = getPackageConfig();
  console.log("Packaging for macOS...");
  copyFiles();
  writePackageJson();

  const { packager } = require("@electron/packager");
  const opts = {
    dir: path.join(RELEASE, "app"),
    out: RELEASE,
    name: config.productName,
    platform: "darwin",
    arch: "universal",
    overwrite: true,
    asar: true,
    appBundleId: config.appId,
    appCategoryType: "public.app-category.developer-tools",
  };
  if (config.mac.icon) opts.icon = config.mac.icon;
  const result = await packager(opts);
  console.log(`macOS build complete: ${result.join(", ")}`);
  return result;
}

async function packageForLinux() {
  const config = getPackageConfig();
  console.log("Packaging for Linux...");
  copyFiles();
  writePackageJson();

  const { packager } = require("@electron/packager");
  const opts = {
    dir: path.join(RELEASE, "app"),
    out: RELEASE,
    name: config.productName,
    platform: "linux",
    arch: "x64",
    overwrite: true,
    asar: true,
  };
  if (config.linux.icon) opts.icon = config.linux.icon;
  const result = await packager(opts);
  console.log(`Linux build complete: ${result.join(", ")}`);
  return result;
}

if (require.main === module) {
  const platform = process.argv[2];
  (async () => {
    try {
      switch (platform) {
        case "win":
        case "windows":
          await packageForWindows();
          break;
        case "mac":
        case "macos":
          await packageForMac();
          break;
        case "linux":
          await packageForLinux();
          break;
        case "all":
          await packageForWindows();
          await packageForMac();
          await packageForLinux();
          break;
        default:
          console.log("Usage: node package.js <win|mac|linux|all>");
          process.exit(1);
      }
      console.log("Packaging complete.");
    } catch (err) {
      console.error("Packaging failed:", err);
      process.exit(1);
    }
  })();
}

module.exports = {
  packageForWindows,
  packageForMac,
  packageForLinux,
  getPackageConfig,
  writePackageJson,
  copyFiles,
};
