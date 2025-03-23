# E2E Testing Flows

## Start the game
- [ ] Validate everything is working fine when first entering the game.
- [ ] Validate you dont have any path selected neither any skill selected.
- [ ] Validade you cannot use any skill with an empty skill bar.

## NPCs interactions
- [ ] Validate you can talk to both NPCs and you are able to not choose a path.
- [ ] Validate you can choose a path and still talk to both NPCs. 
- [ ] Validate you learn the correct skill when choosing dark path.
- [ ] Validate you learn the correct skill when choosing light path.
- [ ] Validate you cannot learn anything from opposite path.

## PVM
- [ ] Validate you cannot use any skill when you dont have a skill
- [ ] Validate you use the correct skills when choosing the dark side
- [ ] Validate you use the correct skills when choosing the light side
- [ ] Validate you cannot attack a monster from a distance bigger than range
- [ ] Validate you are followed by monsters when close to them
- [ ] Validate monsters go back to their spot when leaving their spot
- [ ] Validate monsters go back to their spot but attacks nearby players when returning
- [ ] Validate a monster has a target bar that shows the correct information
- [ ] Validate a monster have the target bar/status bar going down when receives hit
- [ ] Validate a monster dies and disappear when life gets to zero 
- [ ] Validate a monster respawn again after dying
- [ ] Validate you cannot spam skill on monsters

## PVP and Multiplayer
- [ ] Validate you can see other players moving
- [ ] Validate you can see their life status changing in real time
- [ ] Validate you can target a player to see their level and basic info
- [ ] Validate you cannot use any skill when you dont have a skill
- [ ] Validate you cannot attack another player in a temple protected zone
- [ ] Validate you cannot spam skill on players
- [ ] Validate you cannot attack a player from a distance bigger than range
- [ ] Validate you can kill another player in real time
- [ ] Validate the other player when dead is removed from the killer screen
- [ ] Validate the other player respawn correctly after dying

## Collisions
- [ ] Validate pvp has a collision, except on center of the temple
- [ ] Validate NPCs have collision
- [ ] Validate the pillars of temple has collision
- [ ] Validate the border of the map has collision
- [ ] Validate monsters have collision

## UI
- [ ] Validate you have a standard exp, life and mana ring with tooltips. 
- [ ] Validate you have a skill bar with each shortcut
- [ ] Validate you have a karma bar with tooltip
- [ ] Validate EXP bar goes up when gain exp, and also level up correctly
- [ ] Validate HP and Mana updates correctly
- [ ] Validate Karma bar updates correctly

## KARMA
- [ ] Validate dark overlay is working correctly
- [ ] Validate karma goes down until 50 when you are in the temple
- [ ] Validate karma goes up when you kill someone
- [ ] Validate karma increases the damage and make player slower
- [ ] Validate no karma makes a player immune(illuminated) in pvp
- [ ] Validate when illuminated and killing a player, you gain 20 karma instead of usual

## Security
- [ ] Validate you cannot change client code to exploit the game
- [ ] Validate you cannot manipulate server data
- [ ] Validate you cannot ddos the game
- [ ] Validate you cannot hack the server

## Performance
- [ ] Validate you can have multiple server access