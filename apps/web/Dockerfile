# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89
#
# PLACEHOLDER Dockerfile for the `web` app — intentionally a no-op stub.
#
# A correct multi-stage build (turbo prune -> vite build -> static file server,
# mirroring apps/bot/Dockerfile) will be added later. This stub exists so the CI
# app matrix (`turbo ls --filter=./apps/*`) has a Dockerfile to target instead of
# failing on a missing file.
#
FROM busybox:latest@sha256:fd8d9aa63ba2f0982b5304e1ee8d3b90a210bc1ffb5314d980eb6962f1a9715d
CMD ["echo", "starwave web: placeholder image — real build not yet implemented"]
