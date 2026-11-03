# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
#
# PLACEHOLDER Dockerfile for the `web` app — intentionally a no-op stub.
#
# A correct multi-stage build (turbo prune -> vite build -> static file server,
# mirroring apps/bot/Dockerfile) will be added later. This stub exists so the CI
# app matrix (`turbo ls --filter=./apps/*`) has a Dockerfile to target instead of
# failing on a missing file.
#
FROM busybox:latest@sha256:a46257e06c82ad85242d0d38077d0a52d9896389ca60a1a59d3463db586e5fa4
CMD ["echo", "starwave web: placeholder image — real build not yet implemented"]
