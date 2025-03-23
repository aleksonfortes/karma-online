/**
 * MVP.js - Client-side MVP leaderboard UI component
 * 
 * Displays the top 5 players by experience with name, experience, and K/D ratio
 */

export class MVP {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.players = [];
        this.container = null;
        this.isVisible = false;
        
        // Create the MVP UI element
        this.create();
    }
    
    /**
     * Create the MVP UI element
     */
    create() {
        // Create main container
        this.container = document.createElement('div');
        this.container.className = 'mvp-container';
        this.container.style.position = 'absolute';
        this.container.style.top = '10px';
        this.container.style.right = '10px';
        this.container.style.width = '250px';
        this.container.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        this.container.style.border = '1px solid rgba(255, 255, 255, 0.2)';
        this.container.style.borderRadius = '4px';
        this.container.style.color = '#fff';
        this.container.style.fontFamily = 'Arial, sans-serif';
        this.container.style.zIndex = '900';
        this.container.style.display = 'none'; // Hidden by default
        
        // Create header
        const header = document.createElement('div');
        header.className = 'mvp-header';
        header.style.padding = '8px 12px';
        header.style.borderBottom = '1px solid rgba(255, 255, 255, 0.2)';
        header.style.fontWeight = 'bold';
        header.style.fontSize = '14px';
        header.style.textAlign = 'center';
        header.textContent = 'MVP RANKINGS';
        this.container.appendChild(header);
        
        // Create table header
        const tableHeader = document.createElement('div');
        tableHeader.className = 'mvp-table-header';
        tableHeader.style.display = 'grid';
        tableHeader.style.gridTemplateColumns = '1fr 1fr 1fr';
        tableHeader.style.padding = '6px 12px';
        tableHeader.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';
        tableHeader.style.fontSize = '12px';
        tableHeader.style.fontWeight = 'bold';
        tableHeader.style.color = 'rgba(255, 255, 255, 0.7)';
        
        const nameHeader = document.createElement('div');
        nameHeader.textContent = 'NAME';
        tableHeader.appendChild(nameHeader);
        
        const expHeader = document.createElement('div');
        expHeader.textContent = 'EXP';
        expHeader.style.textAlign = 'center';
        tableHeader.appendChild(expHeader);
        
        const kdHeader = document.createElement('div');
        kdHeader.textContent = 'K/D';
        kdHeader.style.textAlign = 'right';
        tableHeader.appendChild(kdHeader);
        
        this.container.appendChild(tableHeader);
        
        // Create players list container
        this.playersList = document.createElement('div');
        this.playersList.className = 'mvp-players-list';
        this.container.appendChild(this.playersList);
        
        // Add to document
        document.body.appendChild(this.container);
    }
    
    /**
     * Update the MVP list with new player data
     * @param {Array} players - Array of player objects with name, experience, and kd
     */
    update(players) {
        this.players = players || [];
        
        // Clear current list
        this.playersList.innerHTML = '';
        
        // If no players, show a message
        if (!this.players.length) {
            const noPlayers = document.createElement('div');
            noPlayers.style.padding = '10px';
            noPlayers.style.textAlign = 'center';
            noPlayers.style.fontSize = '12px';
            noPlayers.style.color = 'rgba(255, 255, 255, 0.5)';
            noPlayers.textContent = 'No players yet';
            this.playersList.appendChild(noPlayers);
            return;
        }
        
        // Add each player to the list
        this.players.forEach((player, index) => {
            const playerRow = document.createElement('div');
            playerRow.className = 'mvp-player-row';
            playerRow.style.display = 'grid';
            playerRow.style.gridTemplateColumns = '1fr 1fr 1fr';
            playerRow.style.padding = '6px 12px';
            playerRow.style.borderBottom = '1px solid rgba(255, 255, 255, 0.05)';
            playerRow.style.fontSize = '12px';
            playerRow.style.color = index === 0 ? '#ffd700' : '#fff'; // Gold for #1
            
            const nameCell = document.createElement('div');
            nameCell.textContent = player.name;
            nameCell.style.overflow = 'hidden';
            nameCell.style.textOverflow = 'ellipsis';
            nameCell.style.whiteSpace = 'nowrap';
            playerRow.appendChild(nameCell);
            
            const expCell = document.createElement('div');
            expCell.textContent = Math.floor(player.experience).toLocaleString();
            expCell.style.textAlign = 'center';
            playerRow.appendChild(expCell);
            
            const kdCell = document.createElement('div');
            kdCell.textContent = player.kd.toFixed(2);
            kdCell.style.textAlign = 'right';
            playerRow.appendChild(kdCell);
            
            this.playersList.appendChild(playerRow);
        });
    }
    
    /**
     * Show the MVP UI
     */
    show() {
        this.container.style.display = 'block';
        this.isVisible = true;
    }
    
    /**
     * Hide the MVP UI
     */
    hide() {
        this.container.style.display = 'none';
        this.isVisible = false;
    }
    
    /**
     * Toggle visibility of the MVP UI
     */
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }
}

export default MVP; 