# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

This is a homework repository for the **GenAI and Agentic AI** training course. Each `homework-N/` directory is an independent assignment with its own tech stack, source code, and documentation.

## Repository Structure

- Each homework lives in its own `homework-N/` folder with `src/`, `docs/screenshots/`, and `demo/` subdirectories.
- Each homework must include `README.md` (overview, AI tools used) and `HOWTORUN.md` (run instructions).
- Screenshots of AI interactions and working API go in `docs/screenshots/`.

## Homework 1: Banking Transactions API

- Build a REST API (Node.js) with in-memory storage
- Endpoints: `POST /transactions`, `GET /transactions`, `GET /transactions/:id`, `GET /accounts/:accountId/balance`
- Transaction filtering by accountId, type, date range
- Account format: `ACC-XXXXX` (alphanumeric)
- Currency: ISO 4217 codes only
- Amount: positive, max 2 decimal places
- Demo files (`run.sh`, `sample-requests.http`, `sample-data.json`) go in `demo/`
