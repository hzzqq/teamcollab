import subprocess
import time
import sys
import os
env = dict(os.environ)
env.pop("DOCKER_HOST", None)
deadline = time.time() + int(sys.argv[1]) if len(sys.argv) > 1 else time.time() + 240
while time.time() < deadline:
    r = subprocess.run(["docker", "info"], capture_output=True, text=True, env=env)
    if r.returncode == 0:
        print("DOCKER_READY")
        sys.exit(0)
    time.sleep(8)
print("STILL_NOT_READY")
sys.exit(1)
