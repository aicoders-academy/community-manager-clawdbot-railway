import assert from "node:assert/strict";
import test from "node:test";

import { extractGroupId, isAllowedGroup } from "../src/community-manager.js";

test("extractGroupId reads common Evolution API webhook shape", () => {
  assert.equal(
    extractGroupId({
      data: {
        key: {
          remoteJid: "120363000000000000@g.us",
        },
      },
    }),
    "120363000000000000@g.us",
  );
});

test("isAllowedGroup only accepts IDs listed in ALLOWED_GROUPS", () => {
  const previousAllowedGroups = process.env.ALLOWED_GROUPS;
  process.env.ALLOWED_GROUPS = "120363000000000000@g.us, 120363111111111111@g.us";

  try {
    assert.equal(isAllowedGroup({ groupId: "120363000000000000@g.us" }), true);
    assert.equal(isAllowedGroup({ groupId: "5511999999999@s.whatsapp.net" }), false);
  } finally {
    if (previousAllowedGroups === undefined) {
      delete process.env.ALLOWED_GROUPS;
    } else {
      process.env.ALLOWED_GROUPS = previousAllowedGroups;
    }
  }
});
