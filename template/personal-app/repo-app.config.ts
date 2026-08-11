import { defineRepoApp } from "@repo-apps/runtime";

export default defineRepoApp({
  id: "personal-app",
  title: "Personal App",
  repository: {
    mode: "self",
    branch: "main",
    dataRoot: "data",
  },
  auth: {
    methods: ["pat"],
    persistence: "optional",
    sharedCredential: false,
  },
  demo: {
    fixture: "./demo/records.json",
  },
  writes: {
    defaultStrategy: "direct",
    conflictStrategy: "prompt",
  },
});
