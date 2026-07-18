# Nomad Path

#### Title
- I kept losing my holiday photos - knew roughly where I'd been, never which day.

#### App
- Found a way to record where I'd been using my phone

#### GPS Visualizer
- To share my holidays, I built an image gallery with a map
- **New tab**, zoom & scroll, click track
- It's cool, but I can't see details: which day, where at night

#### Leaflet POC
- Reverse engineered, built my own
- By hand
- Proof of concept, figure out how to do stuff, no architecture
- Painted into a corner

#### MapLibre POC
- Rebuilt with AI, wanted to see what it could do
- Started Sonnet, moved to Opus, multi agent workflow
- Profiling, show flight
- Got a working map much faster, but still proof of concept quality
- Live rebuild

#### Future
- Architecture
- 3D



# BSides

That last bit — the AI-assisted spikes — is a pretty low-stakes example of something much bigger I want to spend the rest of my time on. The biggest theme running through the BSides Melbourne conference this year wasn't a new CVE or tool, it was exactly this: how fast AI is becoming capable at security-relevant tasks, for better and worse.

BSides is a community-run security conference that started years ago as an overflow of talks rejected from Black Hat. Now BSides runs all over the world. The main Australian event is coming up in Canberra in September, but a few of us were lucky enough to attend the one in Melbourne a few months ago.

Alongside the talks, there's usually a capture-the-flag competition (basically a series of hacking challenges), a lock-picking village where you can learn to pick locks, and a bunch of stands from security vendors.

# XZ to NPM Supply Chain Attacks

> Paul McCarty

Advice on using git to avoid security issues:
* pull_request_target -> BAD
* repo caching
* consolidate branch protections across repos
* gitsign -> git commit signing
* Use CI/CD templates -> opensourcemalware.com
* Don't pin to tags; they're mutable. You must pin to commit shas instead

# What to do to prepare for Mythos

> Katherine Robins

The main talk that stuck with me was Katherine Robins' "Preparing for the Cyber Apocalypse".

Quick background. Mythos is one of the AI models that Anthropic (the company behind Claude) released in June. Until recently, this model was restricted to cybersecurity partners only. The metrics presented showed a 73% success in expert-level CTFs, which means it's becoming easy & cheap to discover and exploit bugs.

But even though attackers get faster, defenders can point the same tools at their own code first. 6 cyber agencies (including our own ACSC) published guidance in April, and Katherine walked through them, providing concrete strategies on how to verify the products we're building.
