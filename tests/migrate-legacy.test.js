"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const assert = require("node:assert/strict");

const scriptPath = path.join(__dirname, "..", "scripts", "migrate-legacy.js");
const script = fs.readFileSync(scriptPath, "utf8").replace(/^#!.*\n/, "");
const entry = script.lastIndexOf("\nmain().catch(error => {");
if (entry < 0) throw new Error("Migration script entry point not found.");
const runnable = script.slice(0, entry) + "\nmain();\n";

function fixture({ failCommitOnce = false } = {}) {
  const docs = new Map();
  const source = {
    clients: Array.from({ length: 401 }, (_, i) => ({
      id: "client-" + i,
      name: "Sample Client " + i
    }))
  };
  let commits = 0;
  let writes = 0;
  let shouldFail = failCommitOnce;

  const key = (collection, id) => collection + "/" + id;
  function ref(collection, id) {
    return {
      get: async () => {
        const documentKey = key(collection, id);
        const isSource = collection === "prototypes" && id === "isp-tracker";
        return {
          exists: docs.has(documentKey) || isSource,
          data: () => docs.get(documentKey) ?? (isSource ? source : undefined)
        };
      },
      create: async data => {
        const documentKey = key(collection, id);
        if (docs.has(documentKey)) throw new Error("Document already exists: " + documentKey);
        docs.set(documentKey, structuredClone(data));
        writes++;
      }
    };
  }

  const firestore = {
    collection: collection => ({ doc: id => ref(collection, id) }),
    batch: () => {
      const operations = [];
      return {
        create: (documentRef, data) => operations.push(() => documentRef.create(data)),
        commit: async () => {
          commits++;
          if (shouldFail && commits === 2) {
            shouldFail = false;
            throw new Error("simulated interruption");
          }
          for (const operation of operations) await operation();
        }
      };
    }
  };
  const fire = () => firestore;
  fire.FieldValue = { serverTimestamp: () => "SERVER_TIMESTAMP" };
  const appModule = {
    initializeApp() {},
    applicationDefault: () => ({})
  };
  const firestoreModule = {
    getFirestore: () => firestore,
    FieldValue: { serverTimestamp: () => "SERVER_TIMESTAMP" }
  };

  async function run(args = []) {
    const logs = [];
    const fakeConsole = { log: value => logs.push(String(value)), error: value => logs.push(String(value)) };
    const fakeProcess = { argv: ["node", scriptPath, ...args], exitCode: 0 };
    const result = vm.runInNewContext(runnable, {
      require: name => {
        if (name === "firebase-admin/app") return appModule;
        if (name === "firebase-admin/firestore") return firestoreModule;
        throw new Error("Unexpected module: " + name);
      },
      process: fakeProcess,
      console: fakeConsole,
      structuredClone
    });
    await result;
    return { logs, exitCode: fakeProcess.exitCode };
  }

  return { docs, key, run, get writes() { return writes; } };
}

test("migration dry run reports counts without writing", async () => {
  const f = fixture();
  const result = await f.run();
  assert.equal(result.exitCode, 0);
  assert.equal(f.writes, 0);
  assert.equal(f.docs.has(f.key("migrationMeta", "collection-v1")), false);
  assert.match(result.logs.join("\n"), /"mode": "DRY RUN"/);
  assert.match(result.logs.join("\n"), /"clients": 401/);
});

test("migration resumes after an interrupted batch without overwriting matching rows", async () => {
  const f = fixture({ failCommitOnce: true });
  await assert.rejects(f.run(["--apply"]), /simulated interruption/);
  assert.equal(f.writes, 400);
  assert.equal(f.docs.has(f.key("migrationMeta", "collection-v1")), false);

  const result = await f.run(["--apply"]);
  assert.equal(result.exitCode, 0);
  assert.equal(f.writes, 403); // 401 clients, labels, and the final marker
  assert.equal(f.docs.has(f.key("migrationMeta", "collection-v1")), true);
  assert.match(result.logs.join("\n"), /"alreadyMigratedRecords": 400/);
});
