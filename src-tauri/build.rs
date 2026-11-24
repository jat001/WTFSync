use std::{
    env,
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
    process::Command,
};

fn run(command: &mut Command) {
    let status = command
        .status()
        .unwrap_or_else(|err| panic!("{command:?}: {err}"));
    assert!(status.success(), "{command:?} exited with {status}");
}

fn cmake() -> PathBuf {
    if let Some(path) = env::var_os("CMAKE") {
        return path.into();
    }
    if Command::new("cmake")
        .arg("--version")
        .output()
        .is_ok_and(|o| o.status.success())
    {
        return "cmake".into();
    }
    let vswhere =
        PathBuf::from(env::var_os("ProgramFiles(x86)").expect("Visual Studio Build Tools"))
            .join("Microsoft Visual Studio/Installer/vswhere.exe");
    let result = Command::new(vswhere)
        .args([
            "-latest",
            "-products",
            "*",
            "-find",
            "Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe",
        ])
        .output()
        .expect("find the CMake supplied with Visual Studio");
    let path = String::from_utf8_lossy(&result.stdout);
    PathBuf::from(
        path.lines()
            .next()
            .expect("CMake is required to build CascLib")
            .trim(),
    )
}

fn build_client_data(manifest: &Path) {
    let root = manifest.join("../tools/clientdata");
    let casc = root.join("casclib");
    let definitions = root.join("definitions");
    for path in [
        root.join("go.mod"),
        root.join("go.sum"),
        root.join("casc_windows.go"),
        root.join("item_details_windows.go"),
        root.join("main_windows.go"),
        casc.join("CMakeLists.txt"),
        casc.join("src"),
        definitions.join("manifest.json"),
        definitions.join("definitions"),
    ] {
        println!("cargo:rerun-if-changed={}", path.display());
    }
    println!("cargo:rerun-if-env-changed=CMAKE");
    assert!(
        casc.join("CMakeLists.txt").is_file() && definitions.join("manifest.json").is_file(),
        "initialize CascLib and WoWDBDefs with git submodule update --init"
    );
    let out = PathBuf::from(env::var_os("OUT_DIR").unwrap());
    let build = out.join("casclib");
    let binaries = manifest.join("binaries");
    fs::create_dir_all(&binaries).expect("create sidecar directory");
    let target = env::var("TARGET").unwrap();
    let arch = match env::var("CARGO_CFG_TARGET_ARCH").unwrap().as_str() {
        "x86_64" => ("x64", "amd64"),
        "aarch64" => ("ARM64", "arm64"),
        "x86" => ("Win32", "386"),
        arch => panic!("unsupported Windows architecture: {arch}"),
    };
    let cmake = cmake();
    run(Command::new(&cmake)
        .args(["-S"])
        .arg(casc)
        .arg("-B")
        .arg(&build)
        .args([
            "-A",
            arch.0,
            "-DCMAKE_POLICY_VERSION_MINIMUM=3.5",
            "-DCMAKE_POLICY_DEFAULT_CMP0091=NEW",
            "-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded",
            "-DCMAKE_DISABLE_FIND_PACKAGE_ZLIB=ON",
            "-DCASC_BUILD_SHARED_LIB=ON",
            "-DCASC_UNICODE=ON",
        ]));
    run(Command::new(cmake)
        .arg("--build")
        .arg(&build)
        .args(["--config", "Release", "--parallel"]));
    fs::copy(
        build.join("Release/CascLib.dll"),
        binaries.join("CascLib.dll"),
    )
    .expect("stage CascLib.dll");

    run(Command::new("go")
        .current_dir(root)
        .args([
            "build",
            "-mod=readonly",
            "-trimpath",
            "-buildvcs=false",
            "-ldflags=-s -w",
            "-o",
        ])
        .arg(binaries.join(format!("wtfsync-clientdata-{target}.exe")))
        .arg(".")
        .env("GOOS", "windows")
        .env("GOARCH", arch.1)
        .env("CGO_ENABLED", "0")
        .env("GOTOOLCHAIN", "local")
        .env("GOCACHE", out.join("go-cache"))
        .env("GOPATH", out.join("go-path")));
}

fn main() {
    if env::var_os("CARGO_CFG_TARGET_OS").as_deref() == Some(OsStr::new("windows")) {
        build_client_data(&PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap()));
    }
    tauri_build::build()
}
