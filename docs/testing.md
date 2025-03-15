# Karma Online Test Checklist

## Terrain and Boundaries
- [ ] Terrain size is correctly set to 250 units
- [ ] Players can walk up to boundary edges with minimal buffer (0.5 units)
- [ ] Position clamping works correctly at boundaries (smooth movement at edges)
- [ ] Players cannot walk beyond the water's edge
- [ ] Terrain height adjustments work correctly
- [ ] **Corner Case:** Player rapidly changes direction at boundaries
- [ ] **Corner Case:** Multiple players pushed against the same boundary
- [ ] **Corner Case:** Skill effects near or at boundaries

## Collision Systems

### Player-to-Player Collision
- [ ] Players cannot walk through each other (1.0 unit radius)
- [ ] Collision push-back feels natural
- [ ] Random offset prevents players from getting stuck together
- [ ] Collision works consistently at different angles of approach
- [ ] **Corner Case:** Three or more players colliding simultaneously
- [ ] **Corner Case:** Rapid movement through crowded areas
- [ ] **Corner Case:** Player collision during skill animations

### Player-to-Environment Collision

#### Temple Pillars
- [ ] Rectangular collision boundaries match pillar shape
- [ ] Base collision (2.0 units wide) works correctly
- [ ] Body collision (1.5 units wide) works correctly
- [ ] No collision occurs when standing on grass (temple floor boundary awareness)
- [ ] Push-back is perpendicular to closest pillar edge
- [ ] Players can walk right up to visual edges (small buffer zones)
- [ ] **Corner Case:** Player gets pushed against pillar by another player
- [ ] **Corner Case:** Player trapped between multiple pillars
- [ ] **Corner Case:** Player rapidly changing direction near pillar corners

#### Statues and Other Environment Objects
- [ ] Collision with statues works correctly
- [ ] Other environment object collisions function as expected
- [ ] **Corner Case:** Player pushed into statue by another player

## NPCs

### Dark NPC
- [ ] NPC appears at correct height (scale value 0.4)
- [ ] Collision radius matches visual size (0.8 units)
- [ ] Interaction text appears 0.3 units above NPC
- [ ] Pressing E near NPC triggers dialogue
- [ ] Dialogue system functions properly
  - [ ] Text displays correctly
  - [ ] Dialogue options work
  - [ ] Dialogue transitions function as expected
  - [ ] Closing dialogue works
- [ ] **Corner Case:** Multiple players interacting with NPC simultaneously
- [ ] **Corner Case:** Player attempts interaction while in combat
- [ ] **Corner Case:** Dialogue interrupted by damage/death

### Light NPC
- [ ] NPC appears at correct height (scale value 4.5)
- [ ] Collision radius matches visual size (2.0 units)
- [ ] Interaction text appears 1.2 units above NPC
- [ ] Pressing E near NPC triggers dialogue
- [ ] Dialogue system functions properly
  - [ ] Text displays correctly
  - [ ] Dialogue options work
  - [ ] Dialogue transitions function as expected
  - [ ] Closing dialogue works
- [ ] **Corner Case:** Testing same edge cases as Dark NPC

## Combat System

### Targeting
- [ ] Target bar appears when selecting a valid target
- [ ] Target bar disappears when:
  - [ ] Target dies
  - [ ] Target moves off-screen
  - [ ] Target becomes invisible
  - [ ] Target is too far away
- [ ] Periodic validation system works (500ms checks)
- [ ] Target references are properly cleaned up when invalid
- [ ] Visual feedback only shows for valid, visible targets
- [ ] **Corner Case:** Target moves behind obstacle
- [ ] **Corner Case:** Rapidly switching between multiple targets
- [ ] **Corner Case:** Target teleports or moves very quickly

### Skills and Damage
- [ ] 'useSkill' event works correctly
- [ ] Damage is applied properly to targets
- [ ] Health bars update in real-time
- [ ] Animation effects display correctly
- [ ] Skills have proper cooldowns
- [ ] **Corner Case:** Multiple players using skills on same target simultaneously
- [ ] **Corner Case:** Using skill at exact moment of target death
- [ ] **Corner Case:** Edge cases for min/max damage values
- [ ] **Corner Case:** Skill interrupted by death or stun effect

### Health System
- [ ] Health bars update in real-time for all players
- [ ] 'lifeUpdate' event handler works correctly
- [ ] Server authority is maintained for health updates
- [ ] Damage effects and animations display correctly
- [ ] 'requestLifeUpdate' handler works when clients request current health data
- [ ] **Corner Case:** Massive damage in single hit (near one-shot)
- [ ] **Corner Case:** Very small damage amounts (1 HP)
- [ ] **Corner Case:** Multiple damage sources simultaneously

### Death and Respawn
- [ ] "YOU DIED" message appears when player is killed
- [ ] 10-second countdown timer functions correctly
- [ ] Smooth fade-in and fade-out transitions work
- [ ] Timers are properly cleaned up when respawning
- [ ] Respawn functionality works when countdown reaches zero
- [ ] Target display clears when a player dies
- [ ] **Corner Case:** Death during skill animation
- [ ] **Corner Case:** Multiple players dying simultaneously
- [ ] **Corner Case:** Death exactly when reconnecting
- [ ] **Corner Case:** Browser tab inactive during death timer

## Network System

### Connection and Reconnection
- [ ] Initial connection establishes correctly
- [ ] Reconnection works after disconnection
- [ ] pendingUpdates Map stores updates for players not yet created
- [ ] applyPendingUpdates method processes queued updates properly
- [ ] No game state is lost during reconnection
- [ ] Players receive all missed updates when reconnecting
- [ ] **Corner Case:** High latency scenarios (100ms, 200ms, 500ms+)
- [ ] **Corner Case:** Packet loss simulation (5%, 10%, 20%)
- [ ] **Corner Case:** Multiple rapid reconnection attempts
- [ ] **Corner Case:** Reconnection after extended disconnect (5+ minutes)
- [ ] **Corner Case:** Connection dropout during combat

### Event Handling
- [ ] Network events trigger appropriate responses
- [ ] Server authority is maintained for critical operations
- [ ] Event propagation works correctly across the system
- [ ] **Corner Case:** Multiple simultaneous events (10+)
- [ ] **Corner Case:** Out-of-order event processing
- [ ] **Corner Case:** Duplicate events

## UI Elements

### Health Bars
- [ ] Player health bar updates correctly
- [ ] Target health bar updates correctly
- [ ] Health percentage displays accurately
- [ ] **Corner Case:** Multiple health bars updating simultaneously
- [ ] **Corner Case:** Health bar updates during UI animations

### Karma Display
- [ ] Karma level displays correctly
- [ ] Karma updates properly after relevant actions
- [ ] **Corner Case:** Rapid karma changes
- [ ] **Corner Case:** Karma at minimum/maximum values

### Skill UI
- [ ] Skill icons display correctly
- [ ] Cooldown indicators function properly
- [ ] Skill effects trigger with correct visual feedback
- [ ] **Corner Case:** Multiple skills activated in quick succession
- [ ] **Corner Case:** Skills activated during other animations
- [ ] **Corner Case:** Skill activation during UI transitions

## Performance and Stability
- [ ] Game maintains stable framerate with multiple players
- [ ] No memory leaks during extended play sessions
- [ ] Game recovers properly from network disruptions
- [ ] No console errors during normal gameplay
- [ ] **Corner Case:** Memory usage with 10+ players in view
- [ ] **Corner Case:** CPU usage during complex battle scenarios
- [ ] **Corner Case:** WebGL context loss and recovery

## Cross-Platform and Browser Compatibility
- [ ] Game functions correctly on Chrome
- [ ] Game functions correctly on Firefox
- [ ] Game functions correctly on Safari
- [ ] Game functions correctly on Edge
- [ ] **Corner Case:** Testing on low-end devices
- [ ] **Corner Case:** Testing on various screen resolutions
- [ ] **Corner Case:** Testing with browser dev tools open

## Accessibility and User Experience
- [ ] Game is playable with keyboard only
- [ ] Color contrast meets accessibility standards
- [ ] Text is readable at all sizes
- [ ] **Corner Case:** Testing with screen readers
- [ ] **Corner Case:** Game window resized during gameplay