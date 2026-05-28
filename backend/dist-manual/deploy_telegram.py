"""
deploy_telegram.py — Deploys Telegram integration compiled JS files to production container.
One-shot script: run locally, do NOT commit.
"""
import sys
import os
import paramiko
import time

SERVER = "38.252.74.32"
USER = "root"
PASS = "exacom2021*"
PORT = 22

# Local dist-manual folder
LOCAL = os.path.dirname(os.path.abspath(__file__))

# Container name
CONTAINER = "whaticket_backend_1"

# Files to deploy: (local filename, container target path)
FILES = [
    ("Telegram.js",          "/usr/src/app/dist/models/Telegram.js"),
    ("Ticket.js",            "/usr/src/app/dist/models/Ticket.js"),
    ("database_index.js",    "/usr/src/app/dist/database/index.js"),
    ("server.js",            "/usr/src/app/dist/server.js"),
    ("TelegramBotService.js","/usr/src/app/dist/services/TelegramService/TelegramBotService.js"),
    ("TelegramController.js","/usr/src/app/dist/controllers/TelegramController.js"),
    ("telegramRoutes.js",    "/usr/src/app/dist/routes/telegramRoutes.js"),
    ("routesIndex.js",       "/usr/src/app/dist/routes/index.js"),
]

REMOTE_TMP = "/tmp/tg_deploy"

def run(ssh, cmd, check=True):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode(errors="replace").strip()
    err = stderr.read().decode(errors="replace").strip()
    rc = stdout.channel.recv_exit_status()
    if out:
        print(f"  OUT: {out}")
    if err:
        print(f"  ERR: {err}")
    if check and rc != 0:
        raise RuntimeError(f"Command failed (rc={rc}): {cmd}")
    return out, err, rc

def main():
    print("Connecting to server...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(SERVER, PORT, USER, PASS, timeout=30)
    print("Connected.")

    sftp = ssh.open_sftp()

    # Create remote temp directory
    print(f"\nCreating {REMOTE_TMP}...")
    run(ssh, f"mkdir -p {REMOTE_TMP}")

    # Upload each file
    print("\nUploading files...")
    for local_name, container_path in FILES:
        local_path = os.path.join(LOCAL, local_name)
        remote_path = f"{REMOTE_TMP}/{local_name}"
        print(f"  Uploading {local_name}...")
        sftp.put(local_path, remote_path)

    sftp.close()

    # Detect container name
    print("\nDetecting container name...")
    out, _, _ = run(ssh, "docker ps --format '{{.Names}}' | grep -i 'backend'", check=False)
    container = out.strip().split("\n")[0] if out.strip() else CONTAINER
    print(f"  Using container: {container}")

    # Create TelegramService directory inside container
    print("\nCreating TelegramService directory in container...")
    run(ssh, f"docker exec {container} mkdir -p /usr/src/app/dist/services/TelegramService")

    # Copy each file into the container
    print("\nCopying files into container...")
    for local_name, container_path in FILES:
        remote_src = f"{REMOTE_TMP}/{local_name}"
        print(f"  {local_name} -> {container_path}")
        run(ssh, f"docker cp {remote_src} {container}:{container_path}")

    # Restart container
    print("\nRestarting backend container...")
    run(ssh, f"docker restart {container}")
    print("  Restart command sent. Waiting 12s for startup...")
    time.sleep(12)

    # Check logs
    print("\nChecking recent logs...")
    out, _, _ = run(ssh, f"docker logs {container} --tail 30 2>&1", check=False)
    print(out)

    # Cleanup
    run(ssh, f"rm -rf {REMOTE_TMP}", check=False)

    print("\nDone! All Telegram files deployed.")
    ssh.close()

if __name__ == "__main__":
    main()
