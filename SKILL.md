---
name: echosight
version: 0.1.0
description: Voice-first ambient visual, video, and spatial co-pilot for blind and low-vision users on Alexa+ and MCP-compatible hosts.
author: Manthan
license: MIT
tools:
  - name: describe_surroundings
    description: Primary continuous tool for live Surroundings Mode. Analyzes incoming camera frame at a steady ~5-second cadence to provide spoken relative spatial descriptions of nearby objects and navigation landmarks.
    parameters:
      image_base64:
        type: string
        required: true
        description: Base64-encoded JPEG/PNG/WebP camera frame.
      mime_type:
        type: string
        required: false
        default: image/jpeg
        description: MIME format of the frame.
      prior_context:
        type: string
        required: false
        description: Recent description context to maintain spatial continuity.
      prev_frame_base64:
        type: string
        required: false
        description: Previous frame to evaluate in-memory scene difference and skip redundant calls.
  - name: analyze_visual
    description: Provides patient, exhaustive, structured spoken walkthroughs of charts, diagrams, tables, maps, and photographs.
    parameters:
      image_base64:
        type: string
        required: true
        description: Base64-encoded image content.
      mime_type:
        type: string
        required: false
        default: image/png
        description: MIME format (image/png, image/jpeg, image/webp).
      focus:
        type: string
        required: false
        description: Optional user focus area (e.g., "trend", "axes", "outliers", "anomalies").
      prior_context:
        type: string
        required: false
        description: Optional prior conversation dialogue.
  - name: analyze_video
    description: Narrates short recorded video clips (up to 30s) chronologically as one continuous scene.
    parameters:
      video_base64:
        type: string
        required: true
        description: Base64-encoded video content.
      mime_type:
        type: string
        required: false
        default: video/mp4
        description: MIME format (video/mp4 or video/webm).
  - name: analyze_scorecard
    description: Contextually reasons over cricket and sports match scorecards, explaining match situation, momentum, and run rates.
    parameters:
      image_base64:
        type: string
        required: true
        description: Base64-encoded scorecard or match graphic.
      mime_type:
        type: string
        required: false
        default: image/jpeg
        description: MIME format.
  - name: ask_followup
    description: Answers follow-up conversational questions about a recently described scene, chart, or scorecard without restating full context.
    parameters:
      question:
        type: string
        required: true
        description: The user follow-up question.
      prior_context:
        type: string
        required: true
        description: The previous description or transcript content.
      image_base64:
        type: string
        required: false
        description: Optional base64 image if re-inspection is needed.
      mime_type:
        type: string
        required: false
        default: image/jpeg
        description: MIME format if image_base64 is provided.
  - name: ping
    description: Verifies EchoSight MCP server connectivity, protocol spec, and health status.
    parameters:
      message:
        type: string
        required: false
        description: Optional message string to echo back.
---

# EchoSight Agent Skill (`SKILL.md`)

## 1. Overview & Purpose
EchoSight is an open-source, voice-first accessibility tool designed for the **Alexa+ track** of Amazon's *Build, Ship, Shape: Developer Hackathon*. 

Unlike traditional vision assistants that return shallow one-sentence labels (e.g. *"A bar chart with four bars"*), EchoSight provides **exhaustive, structured, patient spoken walkthroughs** modeled after how a sighted friend describes a visual scene to a blind companion.

## 2. Voice-First Response Principles
When delivering responses to the user:
1. **Spoken Phrasing:** Structure sentences for listening. Keep sentences relatively short and natural. Never include markdown symbols (asterisks, hashtags, raw URLs) in text meant for speech synthesis.
2. **Relative Spatial Language:** Always describe positions relative to the user's viewpoint (*"Directly in front of you sits..."*, *"To your left..."*, *"Just beyond the table..."*). **Never fabricate precise distance measurements** (e.g. do not say *"2.3 meters away"* — say *"a few steps ahead"* or *"within arm's reach"*).
3. **Proactive Insights First:** Always state the single most important takeaway or anomaly first before unpacking granular details.
4. **Honesty Over Hallucination:** If an image is dark, blurry, or out of focus, state this clearly and advise the user on how to retake it (*"That photo is too blurry to read the labels — try moving slightly back and ensuring good light"*).

## 3. Tool Usage Scenarios

### Scenario A: Live Surroundings Mode
- **User Intent:** *"Describe my surroundings"*, *"What's in front of me?"*, *"Start Surroundings Mode"*.
- **Tool:** `describe_surroundings`
- **Execution:** Invoked continuously on a ~5-second cadence. Uses frame difference detection to report static views without burning unnecessary API requests.

### Scenario B: Detailed Chart / Diagram Walkthrough
- **User Intent:** *"Explain this chart in detail"*, *"What does this diagram show?"*.
- **Tool:** `analyze_visual`
- **Execution:** Breaks down chart title, axes, scale, trends, key data points, and implications.

### Scenario C: Cricket & Sports Match Analysis
- **User Intent:** *"Who is winning this match?"*, *"Read this scorecard"*, *"What is the run rate?"*.
- **Tool:** `analyze_scorecard`
- **Execution:** Analyzes teams, scores, overs, wickets, current vs. required run rate, and momentum.

### Scenario D: Video Clip Narration
- **User Intent:** *"Tell me what is happening in this video"*.
- **Tool:** `analyze_video`
- **Execution:** Chronologically narrates action, movement, and context from start to finish.

### Scenario E: Conversational Follow-Up
- **User Intent:** *"What did you say was on the table to my left?"*, *"How many runs did the opener score?"*.
- **Tool:** `ask_followup`
- **Execution:** Answers the specific query using conversation history without repeating the full description.

## 4. Privacy & Data Handling
- **Zero Persistent Storage:** Camera frames and uploaded visual media are processed strictly in-memory and discarded immediately after generation.
- **Session Limits:** Continuous Surroundings Mode sessions automatically stop after 5 minutes to prevent unattended camera capture.
