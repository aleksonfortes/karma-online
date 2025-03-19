import GameConstants from './src/config/GameConstants.js';

// Test experience calculation function
function calculateExperienceForLevel(level) {
    if (level <= 1) return 0;
    
    const baseExp = GameConstants.EXPERIENCE.BASE_EXPERIENCE;
    const scalingFactor = GameConstants.EXPERIENCE.SCALING_FACTOR;
    
    return Math.floor(baseExp * Math.pow(scalingFactor, level - 2));
}

// Print out experience needed for levels 1-20
console.log('Experience requirements:');
let expNeeded = 0;
let cerberusKills = 0;
for (let i = 1; i <= 20; i++) {
    expNeeded = calculateExperienceForLevel(i);
    cerberusKills = Math.ceil(expNeeded / GameConstants.MONSTER.BASIC.EXPERIENCE_REWARD);
    console.log(`Level ${i-1} to ${i}: ${expNeeded} exp (${cerberusKills} Cerberus kills)`);
} 