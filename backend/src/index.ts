import "dotenv/config";
import express from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { clerkWebhookHandler } from "./webhooks/clerk";
import { getEnv } from "./lib/env";
import fs from "node:fs";
import path from "node:path";
import KeepAliveCron from "./lib/cron";
import productRouter from "./routes/productRouter";
import meRouter from "./routes/meRouter";
import streamRouter from "./routes/streamRouter";
import checkoutRouter from "./routes/checkoutRouter";
import { polarWebhookHandler } from "./webhooks/polar";
import * as Sentry from "@sentry/node";
import type { Request, Response, NextFunction } from "express";
import { sentryClerkUserMiddleware } from "./middleware/sentryClerkUser";

const app = express();
const env = getEnv();

const rawJson = express.raw({type: "application/json", limit: "1mb"});

app.post("/webhooks/clerk", rawJson, (req,res) => {
    void clerkWebhookHandler(req,res)
})

app.post("/webhooks/polar", rawJson, (req,res) => {
     void polarWebhookHandler(req,res)
})

app.use(express.json());
app.use(cors());
app.use(clerkMiddleware());
app.use(sentryClerkUserMiddleware);


app.get("/health", (_req,res) => {
    res.json({ ok: true });
})

app.use("/api/me", meRouter);
app.use("/api/products", productRouter);
app.use("/api/stream", streamRouter);
app.use("/api/checkout", checkoutRouter);

const publicDir = path.join(process.cwd(),"public")
if(fs.existsSync(publicDir)){
    app.use(express.static(publicDir))
    app.get("/{*any}", (req, res, next) => {
        if(req.method !=="GET" && req.method !== "HEAD") {
            next();
            return;
        }
        if(req.path.startsWith("/api") || req.path.startsWith("/webhooks")) {
            next();
            return;
        }

        res.sendFile(path.join(publicDir, "index.html"), (err) => next(err));
    })
}

Sentry.setupExpressErrorHandler(app);
//todo: add error handler middleware
app.use((err:unknown ,req:Request ,res:Response ,next:NextFunction) => {
    const sentryId = (res as express.Response & {sentry?: string}).sentry;
    res.status(500).json({
        error: "Internal server error",
        ...(sentryId !== undefined && { sentryId }),
    })
})

app.listen(env.PORT,() => {
    console.log("listening on port:", env.PORT);
    if(env.NODE_ENV === "production"){
        KeepAliveCron.start();
    }
});