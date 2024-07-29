podman build -f build/dockerfiles/linux-musl.Dockerfile -t linux-musl-amd64 .
podman build -f build/dockerfiles/linux-libc-ubi8.Dockerfile -t linux-libc-ubi8-amd64 .
podman build -f build/dockerfiles/linux-libc-ubi9.Dockerfile -t linux-libc-ubi9-amd64 .
podman build -f build/dockerfiles/assembly.Dockerfile -t harbor.weebo.fr/batleforc/che-code:latest .
podman push harbor.weebo.fr/batleforc/che-code:latest