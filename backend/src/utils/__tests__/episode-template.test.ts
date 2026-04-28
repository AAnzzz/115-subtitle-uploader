import test from "node:test";
import assert from "node:assert/strict";
import { detectEpisodeFromName } from "../episode";
import { renderTargetName } from "../template";

test("detects S01E01", () => {
  const result = detectEpisodeFromName("Azumanga Daioh S01E01 test.ass");
  assert.equal(result.episode, "01");
});

test("detects E01", () => {
  const result = detectEpisodeFromName("Azumanga Daioh E01 test.ass");
  assert.equal(result.episode, "01");
});

test("detects standalone number", () => {
  const result = detectEpisodeFromName("Azumanga Daioh - 01 [x265].ass");
  assert.equal(result.episode, "01");
});

test("renders template placeholders", () => {
  const result = renderTargetName({
    template: "Azumanga Daioh S{season:2}E{episode:2} &&",
    season: "1",
    episode: "1",
    fallbackEpisode: "01"
  });
  assert.equal(result, "Azumanga Daioh S01E01 01");
});

test("renders simplified chinese placeholders", () => {
  const result = renderTargetName({
    template: "阿滋漫画大王 S{季}E{集}",
    season: "1",
    episode: "2",
    fallbackEpisode: "02"
  });
  assert.equal(result, "阿滋漫画大王 S01E02");
});
