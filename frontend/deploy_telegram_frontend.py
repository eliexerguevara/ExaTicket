"""
deploy_telegram_frontend.py
Uploads the 3 changed frontend source files to the server,
runs Vite build, then deploys to the nginx container.
One-shot script — do NOT commit.
"""
import sys, os, paramiko, time

sys.stdout.reconfigure(encoding="utf-8")

SERVER = "38.252.74.32"
USER   = "root"
PASS   = "exacom2021*"

LOCAL_ROOT  = os.path.dirname(os.path.abspath(__file__))
REMOTE_ROOT = "/root/ExaTicket/frontend"
CONTAINER   = "exaticket-frontend-1"

# Local path → remote path
FILES = [
    (
        os.path.join(LOCAL_ROOT, "src", "pages", "Telegram", "index.js"),
        f"{REMOTE_ROOT}/src/pages/Telegram/index.js",
    ),
    (
        os.path.join(LOCAL_ROOT, "src", "routes", "index.js"),
        f"{REMOTE_ROOT}/src/routes/index.js",
    ),
    (
        os.path.join(LOCAL_ROOT, "src", "layout", "MainListItems.js"),
        f"{REMOTE_ROOT}/src/layout/MainListItems.js",
    ),
]

def run(ssh, cmd, check=True, timeout=120):
    print(f"  $ {cmd[:100]}")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err = stderr.read().decode("utf-8", errors="replace").strip()
    rc  = stdout.channel.recv_exit_status()
    if out: print(f"    OUT: {out[:300]}")
    if err: print(f"    ERR: {err[:300]}")
    if check and rc != 0:
        raise RuntimeError(f"Failed (rc={rc})")
    return out

def main():
    print("Connecting to server...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(SERVER, 22, USER, PASS, timeout=30)
    sftp = ssh.open_sftp()
    print("Connected.\n")

    # 1. Upload source files
    print("=== Uploading source files ===")
    for local, remote in FILES:
        # Create remote directory if needed
        remote_dir = remote.rsplit("/", 1)[0]
        run(ssh, f"mkdir -p {remote_dir}")
        sftp.put(local, remote)
        print(f"  Uploaded: {os.path.basename(local)} -> {remote}")

    sftp.close()

    # 2. Build frontend using node:18-alpine Docker image
    print("\n=== Building frontend (npm run build) ===")
    print("  This may take 1-2 minutes...")
    build_cmd = (
        "docker run --rm "
        f"-v {REMOTE_ROOT}:/app "
        "-w /app "
        "node:18-alpine "
        "sh -c 'npm run build 2>&1'"
    )
    stdin, stdout, stderr = ssh.exec_command(build_cmd, timeout=300)
    # Stream output
    for line in stdout:
        l = line.rstrip().encode("utf-8", errors="replace").decode("utf-8", errors="replace")
        if l.strip():
            print(f"  {l}")
    rc = stdout.channel.recv_exit_status()
    if rc != 0:
        raise RuntimeError(f"Build failed with exit code {rc}")
    print("  Build successful.")

    # 3. Copy build to nginx container
    print(f"\n=== Deploying build to {CONTAINER} ===")
    run(ssh, f"docker cp {REMOTE_ROOT}/build/. {CONTAINER}:/var/www/public/")
    print("  Build deployed to nginx container.")

    print("\nDone! Frontend is updated.")
    ssh.close()

if __name__ == "__main__":
    main()
