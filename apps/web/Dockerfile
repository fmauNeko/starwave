# syntax=docker/dockerfile:1@sha256:ecfaec9ed6d810b56388c508f4121597bfbba70d41a6dfeee4d8cad5f295fc32
#
# PLACEHOLDER Dockerfile for the `web` app — intentionally a no-op stub.
#
# A correct multi-stage build (turbo prune -> vite build -> static file server,
# mirroring apps/bot/Dockerfile) will be added later. This stub exists so the CI
# app matrix (`turbo ls --filter=./apps/*`) has a Dockerfile to target instead of
# failing on a missing file.
#
FROM busybox:latest@sha256:fd7dc98638c8e305f4dc34e979f1c0fdfdcaeb0fbf8fcff77ae834b6da3d7e6e
CMD ["echo", "starwave web: placeholder image — real build not yet implemented"]
