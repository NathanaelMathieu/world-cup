// 1. Participant Team Draft Mapping
const TEAM_MAPPING = {
  "Geoff": ["Spain", "Austria"],
  "Jake": ["France", "Egypt"],
  "Henry": ["England", "Canada"],
  "Jonathan": ["Brazil", "Ecuador"],
  "Nate": ["Argentina", "Senegal"],
  "Andrew C": ["Portugal", "Croatia"],
  "Adam": ["Germany", "Turkey"],
  "Jack": ["Netherlands", "Switzerland"],
  "George": ["Belgium", "Mexico"],
  "Charlie/Max": ["Norway", "Uruguay"],
  "Andrew S": ["Colombia", "USA"], // Normalized "Columbia" -> "Colombia"
  "Bailey": ["Morocco", "Japan"]
};

// Emoji Flag Map for all drafted teams
const FLAG_MAP = {
  "Spain": "🇪🇸",
  "Austria": "🇦🇹",
  "France": "🇫🇷",
  "Egypt": "🇪🇬",
  "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "Canada": "🇨🇦",
  "Brazil": "🇧🇷",
  "Ecuador": "🇪🇨",
  "Argentina": "🇦🇷",
  "Senegal": "🇸🇳",
  "Portugal": "🇵🇹",
  "Croatia": "🇭🇷",
  "Germany": "🇩🇪",
  "Turkey": "🇹🇷",
  "Netherlands": "🇳🇱",
  "Switzerland": "🇨🇭",
  "Belgium": "🇧🇪",
  "Mexico": "🇲🇽",
  "Norway": "🇳🇴",
  "Uruguay": "🇺🇾",
  "Colombia": "🇨🇴",
  "USA": "🇺🇸",
  "Morocco": "🇲🇦",
  "Japan": "🇯🇵"
};

// Normalize team names for matching
function normalizeTeamName(name) {
  if (!name) return "";
  const n = name.trim();
  if (n.toLowerCase() === "columbia") return "Colombia";
  return n;
}

const ROUND_ORDER = [
  "Group stage",
  "Round of 32",
  "Round of 16",
  "Quarter-final",
  "Semi-final",
  "Match for third place",
  "Final"
];

function getNormalizedRound(roundName) {
  if (!roundName) return "Group stage";
  if (roundName.startsWith("Matchday")) return "Group stage";
  return roundName;
}

function formatDisplayRound(round) {
  if (!round) return "Group Stage";
  if (round.startsWith("Matchday") || round === "Group stage") return "Group Stage";
  if (round === "Round of 32") return "Round of 32";
  if (round === "Round of 16") return "Round of 16";
  if (round === "Quarter-final") return "Quarter-Finals";
  if (round === "Semi-final") return "Semi-Finals";
  if (round === "Match for third place") return "3rd Place Match";
  if (round === "Final") return "Final";
  return round;
}

// Escapes special characters to prevent HTML/XSS injection
function escapeHTML(str) {
  if (!str) return "";
  return String(str).replace(/[&<>"']/g, function (m) {
    switch (m) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#039;';
    }
  });
}

let leaderboardData = [];

// Load initial data from localStorage if exists
function loadCache() {
  try {
    const cached = localStorage.getItem('wffl_worldcup_leaderboard');
    const cachedStats = localStorage.getItem('wffl_worldcup_summary');
    if (cached) {
      leaderboardData = JSON.parse(cached);
      renderLeaderboard();
      if (cachedStats) {
        updateSummaryCards(JSON.parse(cachedStats));
      }
      document.getElementById('loading-state').classList.add('hidden');
    }
  } catch(e) {
    console.error("Failed to load cache:", e);
  }
}

// Fetch World Cup data from openfootball API
async function fetchData() {
  const banner = document.getElementById('error-banner');
  try {
    const res = await fetch("https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json");
    if (!res.ok) throw new Error("Network response was not ok");
    
    const data = await res.json();
    processTournamentData(data);
    banner.classList.add('hidden');
    
    // Update sync time
    const now = new Date();
    const timeString = now.toTimeString().split(' ')[0];
    document.getElementById('last-synced').innerText = `Last synced: ${timeString}`;
  } catch (err) {
    console.error("Failed to fetch world cup data:", err);
    banner.classList.remove('hidden');
    const now = new Date();
    const timeString = now.toTimeString().split(' ')[0];
    document.getElementById('last-synced').innerText = `Sync failed (${timeString})`;
  }
}

// Process openfootball data to compute standings & metrics
function processTournamentData(data) {
  const stats = {};
  const draftedTeams = new Set();
  
  // Collect all teams drafted
  Object.values(TEAM_MAPPING).forEach(teams => {
    teams.forEach(t => draftedTeams.add(t));
  });

  // Initialize structures for drafted teams
  draftedTeams.forEach(t => {
    stats[t] = {
      name: t,
      goals: 0,
      gd: 0,
      furthestRound: "Group stage",
      finalWinner: false,
      finalRunnerUp: false,
      thirdPlaceWinner: false,
      eliminated: false,
      hasScheduledFutureMatch: false
    };
  });

  let totalGoals = 0;
  let completedMatchesCount = 0;

  // First pass: Calculate rounds reached based on team matchups
  data.matches.forEach(m => {
    const t1 = normalizeTeamName(m.team1);
    const t2 = normalizeTeamName(m.team2);
    const isPlayed = m.score && m.score.ft;

    // If team names are resolved, update their furthest round participation
    if (t1 && stats[t1]) {
      updateFurthestRound(t1, m.round);
      if (!isPlayed) stats[t1].hasScheduledFutureMatch = true;
    }
    if (t2 && stats[t2]) {
      updateFurthestRound(t2, m.round);
      if (!isPlayed) stats[t2].hasScheduledFutureMatch = true;
    }

    if (isPlayed) {
      completedMatchesCount++;
      const g1 = m.score.ft[0];
      const g2 = m.score.ft[1];
      totalGoals += (g1 + g2);

      if (t1 && stats[t1]) {
        stats[t1].goals += g1;
        stats[t1].gd += (g1 - g2);
      }
      if (t2 && stats[t2]) {
        stats[t2].goals += g2;
        stats[t2].gd += (g2 - g1);
      }

      // Real-time knockout advancement logic
      const roundName = getNormalizedRound(m.round);
      if (roundName !== "Group stage") {
        let winner = null;
        let loser = null;
        if (g1 > g2) {
          winner = t1;
          loser = t2;
        } else if (g2 > g1) {
          winner = t2;
          loser = t1;
        }

        if (winner && stats[winner]) {
          // Winner advances to the next stage in hierarchy
          if (roundName === "Round of 32") {
            updateFurthestRound(winner, "Round of 16");
          } else if (roundName === "Round of 16") {
            updateFurthestRound(winner, "Quarter-final");
          } else if (roundName === "Quarter-final") {
            updateFurthestRound(winner, "Semi-final");
          } else if (roundName === "Semi-final") {
            updateFurthestRound(winner, "Final");
          } else if (roundName === "Final") {
            stats[winner].finalWinner = true;
            stats[loser].finalRunnerUp = true;
          } else if (roundName === "Match for third place") {
            stats[winner].thirdPlaceWinner = true;
          }
        }
        
        // Mark losers of knockout matches as eliminated
        if (loser && stats[loser]) {
          // Semi-final losers play in 3rd place match, so they aren't eliminated yet
          if (roundName !== "Semi-final" && roundName !== "Final") {
            stats[loser].eliminated = true;
          }
        }
      }
    }
  });

  // Helper function to dynamically update a team's furthest round reached
  function updateFurthestRound(teamName, roundName) {
    const rName = getNormalizedRound(roundName);
    const currIdx = ROUND_ORDER.indexOf(stats[teamName].furthestRound);
    const newIdx = ROUND_ORDER.indexOf(rName);
    if (newIdx > currIdx) {
      stats[teamName].furthestRound = rName;
    }
  }

  // Check for Group Stage elimination:
  // If the Group Stage is completed and a team didn't reach the Round of 32, they are eliminated.
  const allGroupMatchesCompleted = data.matches
    .filter(m => m.round.startsWith("Matchday"))
    .every(m => m.score && m.score.ft);

  if (allGroupMatchesCompleted) {
    Object.keys(stats).forEach(t => {
      if (stats[t].furthestRound === "Group stage") {
        stats[t].eliminated = true;
      }
    });
  }

  // 3. Scoring Rules calculation for each team
  function calculateTeamPoints(teamName) {
    const t = stats[teamName];
    if (!t) return 0;
    
    if (t.finalWinner) return 7; // Gold
    if (t.finalRunnerUp) return 6; // Silver
    if (t.furthestRound === "Final") return 6; // Reached Final, guaranteed at least Silver
    if (t.thirdPlaceWinner) return 5; // Bronze
    if (t.furthestRound === "Match for third place") return 4; // 4th place
    
    const ptsMap = {
      "Group stage": 0,
      "Round of 32": 1,
      "Round of 16": 2,
      "Quarter-final": 3,
      "Semi-final": 4
    };
    
    return ptsMap[t.furthestRound] || 0;
  }

  // Assemble participants summary
  leaderboardData = Object.keys(TEAM_MAPPING).map(name => {
    const teams = TEAM_MAPPING[name];
    const teamAStats = stats[teams[0]] || { name: teams[0], goals: 0, gd: 0, furthestRound: "Group stage", eliminated: false };
    const teamBStats = stats[teams[1]] || { name: teams[1], goals: 0, gd: 0, furthestRound: "Group stage", eliminated: false };
    
    const ptsA = calculateTeamPoints(teams[0]);
    const ptsB = calculateTeamPoints(teams[1]);
    
    const totalPoints = ptsA + ptsB;
    const totalGoals = teamAStats.goals + teamBStats.goals;
    const totalGD = teamAStats.gd + teamBStats.gd;
    
    return {
      name,
      teams: [
        { 
          name: teams[0], 
          round: teamAStats.furthestRound, 
          points: ptsA, 
          goals: teamAStats.goals, 
          gd: teamAStats.gd,
          eliminated: teamAStats.eliminated && !teamAStats.hasScheduledFutureMatch
        },
        { 
          name: teams[1], 
          round: teamBStats.furthestRound, 
          points: ptsB, 
          goals: teamBStats.goals, 
          gd: teamBStats.gd,
          eliminated: teamBStats.eliminated && !teamBStats.hasScheduledFutureMatch
        }
      ],
      totalPoints,
      totalGoals,
      totalGD
    };
  });

  // Sort leaderboard: Points desc, Goals desc, GD desc, Name asc
  leaderboardData.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    if (b.totalGoals !== a.totalGoals) {
      return b.totalGoals - a.totalGoals;
    }
    if (b.totalGD !== a.totalGD) {
      return b.totalGD - a.totalGD;
    }
    return a.name.localeCompare(b.name);
  });

  // Compute rank numbers (sharing rank for exact ties)
  let rank = 1;
  leaderboardData.forEach((p, idx) => {
    if (idx > 0) {
      const prev = leaderboardData[idx - 1];
      if (p.totalPoints !== prev.totalPoints || p.totalGoals !== prev.totalGoals || p.totalGD !== prev.totalGD) {
        rank = idx + 1;
      }
    }
    p.rank = rank;
  });

  // Cache locally
  try {
    localStorage.setItem('wffl_worldcup_leaderboard', JSON.stringify(leaderboardData));
    const summaryData = {
      leaderName: leaderboardData[0]?.name || "-",
      leaderPts: leaderboardData[0]?.totalPoints || 0,
      completedMatches: completedMatchesCount,
      totalGoals: totalGoals
    };
    localStorage.setItem('wffl_worldcup_summary', JSON.stringify(summaryData));
    updateSummaryCards(summaryData);
  } catch(e) {
    console.error("Local storage caching failed:", e);
  }

  document.getElementById('loading-state').classList.add('hidden');
  renderLeaderboard();
}

// Generate explanations for all participants tied on points
function compareTiebreakers(a, b) {
  if (b.totalPoints !== a.totalPoints) {
    return b.totalPoints - a.totalPoints;
  }
  if (b.totalGoals !== a.totalGoals) {
    return b.totalGoals - a.totalGoals;
  }
  if (b.totalGD !== a.totalGD) {
    return b.totalGD - a.totalGD;
  }
  return 0; // Completely tied
}

// Update Quick Stats widgets
function updateSummaryCards(summary) {
  document.getElementById('summary-leader').innerText = summary.leaderName;
  document.getElementById('summary-leader-pts').innerText = `${summary.leaderPts} PTS`;
  document.getElementById('summary-matches').innerText = summary.completedMatches;
  document.getElementById('summary-goals').innerText = summary.totalGoals;
}

// Render leaderboard rows to DOM (Using template cloning & DOM APIs to avoid innerHTML)
function renderLeaderboard() {
  const container = document.getElementById('leaderboard-container');
  const searchQuery = document.getElementById('search-input').value.toLowerCase().trim();
  
  const filtered = leaderboardData.filter(p => {
    if (!searchQuery) return true;
    const matchesName = p.name.toLowerCase().includes(searchQuery);
    const matchesTeam1 = p.teams[0].name.toLowerCase().includes(searchQuery);
    const matchesTeam2 = p.teams[1].name.toLowerCase().includes(searchQuery);
    return matchesName || matchesTeam1 || matchesTeam2;
  });

  // Clear previous rows safely without innerHTML
  container.textContent = '';

  if (filtered.length === 0 && leaderboardData.length > 0) {
    document.getElementById('empty-state').classList.remove('hidden');
    return;
  } else {
    document.getElementById('empty-state').classList.add('hidden');
  }

  const template = document.getElementById('leaderboard-row-template');

  filtered.forEach(p => {
    const clone = template.content.cloneNode(true);
    
    const row = clone.querySelector('.leaderboard-item');
    const rowHeader = clone.querySelector('.row-header');
    const rankBadge = clone.querySelector('.rank-badge');
    const managerText = clone.querySelector('.manager-text');
    const activeBadge = clone.querySelector('.active-badge');
    const teamsSubtext = clone.querySelector('.teams-subtext');
    const pointsVal = clone.querySelector('.points-val');
    const chevron = clone.querySelector('.accordion-chevron');

    const team1 = p.teams[0];
    const team2 = p.teams[1];
    
    const flag1 = FLAG_MAP[team1.name] || "🏳️";
    const flag2 = FLAG_MAP[team2.name] || "🏳️";

    // Set rank styling
    rankBadge.textContent = p.rank;
    if (p.rank === 1) {
      rankBadge.className = "rank-badge w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold bg-gradient-to-br from-amber-300 to-yellow-500 text-slate-950 font-bold";
      row.className = "leaderboard-item bg-slate-900/60 border border-yellow-500/20 rounded-2xl overflow-hidden glass-card transition-all duration-200";
    } else if (p.rank === 2) {
      rankBadge.className = "rank-badge w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold bg-gradient-to-br from-slate-300 to-slate-400 text-slate-950 font-bold";
      row.className = "leaderboard-item bg-slate-900/60 border border-slate-400/20 rounded-2xl overflow-hidden glass-card transition-all duration-200";
    } else if (p.rank === 3) {
      rankBadge.className = "rank-badge w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold bg-gradient-to-br from-amber-600 to-amber-700 text-slate-100 font-bold";
      row.className = "leaderboard-item bg-slate-900/60 border border-amber-700/20 rounded-2xl overflow-hidden glass-card transition-all duration-200";
    } else {
      rankBadge.className = "rank-badge w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold bg-slate-800 text-slate-300";
      row.className = "leaderboard-item bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden glass-card transition-all duration-200";
    }

    // Set manager details
    managerText.textContent = p.name;
    pointsVal.textContent = p.totalPoints;

    // Active badge
    const activeCount = (!team1.eliminated ? 1 : 0) + (!team2.eliminated ? 1 : 0);
    if (activeCount === 2) {
      activeBadge.textContent = "2 Active";
      activeBadge.className = "active-badge ml-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase";
    } else if (activeCount === 1) {
      activeBadge.textContent = "1 Active";
      activeBadge.className = "active-badge ml-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase";
    } else {
      activeBadge.textContent = "Out";
      activeBadge.className = "active-badge ml-2 bg-slate-800 text-slate-500 border border-slate-700/50 text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase";
    }

    // Teams subtext
    teamsSubtext.textContent = `${flag1} ${team1.name} • ${flag2} ${team2.name}`;

    // Team A Card
    clone.querySelector('.team-a-flag').textContent = flag1;
    const teamANameNode = clone.querySelector('.team-a-name');
    teamANameNode.textContent = team1.name;
    if (team1.eliminated) {
      teamANameNode.className = "team-a-name font-bold text-slate-200 text-xs tracking-tight truncate opacity-40 line-through decoration-rose-500/50";
    } else {
      teamANameNode.className = "team-a-name font-bold text-slate-200 text-xs tracking-tight truncate";
    }
    clone.querySelector('.team-a-round').textContent = escapeHTML(formatDisplayRound(team1.round));
    
    const teamAStatusNode = clone.querySelector('.team-a-status');
    if (team1.eliminated) {
      teamAStatusNode.textContent = 'OUT';
      teamAStatusNode.className = 'team-a-status font-bold px-1 rounded text-[8px] uppercase bg-rose-950/40 border border-rose-900/50 text-rose-400';
    } else {
      teamAStatusNode.textContent = 'ALIVE';
      teamAStatusNode.className = 'team-a-status font-bold px-1 rounded text-[8px] uppercase bg-emerald-950/40 border border-emerald-900/50 text-emerald-400';
    }
    clone.querySelector('.team-a-pts').textContent = `+${team1.points}`;
    clone.querySelector('.team-a-goals').textContent = team1.goals;
    
    const gd1 = team1.gd > 0 ? `+${team1.gd}` : team1.gd;
    const teamAGDNode = clone.querySelector('.team-a-gd');
    teamAGDNode.textContent = gd1;
    teamAGDNode.className = `team-a-gd text-xs font-bold ${team1.gd > 0 ? 'text-blue-400' : team1.gd < 0 ? 'text-rose-400' : 'text-slate-400'}`;

    // Team B Card
    clone.querySelector('.team-b-flag').textContent = flag2;
    const teamBNameNode = clone.querySelector('.team-b-name');
    teamBNameNode.textContent = team2.name;
    if (team2.eliminated) {
      teamBNameNode.className = "team-b-name font-bold text-slate-200 text-xs tracking-tight truncate opacity-40 line-through decoration-rose-500/50";
    } else {
      teamBNameNode.className = "team-b-name font-bold text-slate-200 text-xs tracking-tight truncate";
    }
    clone.querySelector('.team-b-round').textContent = escapeHTML(formatDisplayRound(team2.round));
    
    const teamBStatusNode = clone.querySelector('.team-b-status');
    if (team2.eliminated) {
      teamBStatusNode.textContent = 'OUT';
      teamBStatusNode.className = 'team-b-status font-bold px-1 rounded text-[8px] uppercase bg-rose-950/40 border border-rose-900/50 text-rose-400';
    } else {
      teamBStatusNode.textContent = 'ALIVE';
      teamBStatusNode.className = 'team-b-status font-bold px-1 rounded text-[8px] uppercase bg-emerald-950/40 border border-emerald-900/50 text-emerald-400';
    }
    clone.querySelector('.team-b-pts').textContent = `+${team2.points}`;
    clone.querySelector('.team-b-goals').textContent = team2.goals;
    
    const gd2 = team2.gd > 0 ? `+${team2.gd}` : team2.gd;
    const teamBGDNode = clone.querySelector('.team-b-gd');
    teamBGDNode.textContent = gd2;
    teamBGDNode.className = `team-b-gd text-xs font-bold ${team2.gd > 0 ? 'text-blue-400' : team2.gd < 0 ? 'text-rose-400' : 'text-slate-400'}`;

    // Combined summary
    clone.querySelector('.combined-goals').textContent = p.totalGoals;
    const combinedGDVal = p.totalGD > 0 ? `+${p.totalGD}` : p.totalGD;
    clone.querySelector('.combined-gd').textContent = combinedGDVal;

    // Tiebreaker Analysis (Safely constructed using DOM nodes to avoid innerHTML)
    const tiedWith = leaderboardData.filter(o => o.name !== p.name && o.totalPoints === p.totalPoints);
    const tiebreakerWrapper = clone.querySelector('.tiebreaker-wrapper');
    if (tiedWith.length > 0) {
      tiebreakerWrapper.classList.remove('hidden');
      clone.querySelector('.tiebreaker-pts-val').textContent = p.totalPoints;
      
      const listContainer = clone.querySelector('.tiebreaker-list');
      listContainer.textContent = ''; // clear

      tiedWith.forEach(o => {
        const li = document.createElement('li');
        li.className = 'flex items-start gap-1.5 text-[11px] leading-relaxed';

        const dot = document.createElement('span');
        dot.className = 'text-slate-500 mt-0.5';
        dot.textContent = '•';

        const sentenceSpan = document.createElement('span');
        
        const mainManagerName = document.createElement('span');
        mainManagerName.textContent = p.name + ' ';

        const verbSpan = document.createElement('span');
        const diff = compareTiebreakers(p, o);
        const signP = p.totalGD > 0 ? "+" : "";
        const signO = o.totalGD > 0 ? "+" : "";

        const oppName = document.createElement('span');
        oppName.className = 'text-slate-100 font-semibold';
        oppName.textContent = o.name;

        if (diff < 0) {
          verbSpan.className = 'text-emerald-400 font-bold';
          verbSpan.textContent = 'wins';
          
          sentenceSpan.appendChild(mainManagerName);
          sentenceSpan.appendChild(verbSpan);
          sentenceSpan.appendChild(document.createTextNode(' the tiebreaker over '));
          sentenceSpan.appendChild(oppName);
          
          if (p.totalGoals !== o.totalGoals) {
            sentenceSpan.appendChild(document.createTextNode(` on total goals scored (${p.totalGoals} vs ${o.totalGoals}).`));
          } else {
            sentenceSpan.appendChild(document.createTextNode(` on goal differential (${signP}${p.totalGD} vs ${signO}${o.totalGD}) because they have the same total goals (${p.totalGoals}).`));
          }
        } else if (diff > 0) {
          verbSpan.className = 'text-rose-400 font-bold';
          verbSpan.textContent = 'loses';

          sentenceSpan.appendChild(mainManagerName);
          sentenceSpan.appendChild(verbSpan);
          sentenceSpan.appendChild(document.createTextNode(' the tiebreaker to '));
          sentenceSpan.appendChild(oppName);

          if (p.totalGoals !== o.totalGoals) {
            sentenceSpan.appendChild(document.createTextNode(` because ${o.name} has more total goals (${o.totalGoals} vs ${p.totalGoals}).`));
          } else {
            sentenceSpan.appendChild(document.createTextNode(` on goal differential (${signP}${p.totalGD} vs ${signO}${o.totalGD}) with equal goals (${p.totalGoals}).`));
          }
        } else {
          verbSpan.className = 'text-amber-400 font-semibold';
          verbSpan.textContent = 'is completely tied';
          
          sentenceSpan.appendChild(mainManagerName);
          sentenceSpan.appendChild(verbSpan);
          sentenceSpan.appendChild(document.createTextNode(' with '));
          sentenceSpan.appendChild(oppName);
          sentenceSpan.appendChild(document.createTextNode(` (same goals: ${p.totalGoals}, GD: ${signP}${p.totalGD}).`));
        }

        li.appendChild(dot);
        li.appendChild(sentenceSpan);
        listContainer.appendChild(li);
      });
    }

    // Bind event listener for the rowHeader
    rowHeader.addEventListener('click', () => {
      toggleParticipantRow(rowHeader);
    });

    container.appendChild(clone);
  });
}

// Toggle row detail panel (Single Expand Mode - Pure CSS Class Based, no inline styles!)
function toggleParticipantRow(headerElement) {
  const item = headerElement.parentElement;
  const content = item.querySelector('.accordion-wrapper');
  const chevron = headerElement.querySelector('.accordion-chevron');
  
  const isOpen = content.classList.contains('is-open');

  // Collapse all other accordion cards
  document.querySelectorAll('.accordion-wrapper').forEach(el => {
    if (el !== content) {
      el.classList.remove('is-open');
      const otherChevron = el.previousElementSibling.querySelector('.accordion-chevron');
      if (otherChevron) otherChevron.classList.remove('rotate-180');
      el.parentElement.classList.remove('ring-1', 'ring-emerald-500/20');
    }
  });

  // Toggle current
  if (!isOpen) {
    content.classList.add('is-open');
    if (chevron) chevron.classList.add('rotate-180');
    item.classList.add('ring-1', 'ring-emerald-500/20');
  } else {
    content.classList.remove('is-open');
    if (chevron) chevron.classList.remove('rotate-180');
    item.classList.remove('ring-1', 'ring-emerald-500/20');
  }
}

// Setup input search queries
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');

searchInput.addEventListener('input', () => {
  if (searchInput.value.length > 0) {
    searchClear.classList.remove('hidden');
  } else {
    searchClear.classList.add('hidden');
  }
  renderLeaderboard();
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.classList.add('hidden');
  renderLeaderboard();
});

// App Initialization
window.addEventListener('DOMContentLoaded', () => {
  loadCache();
  fetchData();
});
