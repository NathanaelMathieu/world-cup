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

// App state
let leaderboardData = [];
let secondsLeft = 30;
let syncTimer = null;
let countdownTimer = null;

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

// Initialize timers
function initTimers() {
  if (syncTimer) clearInterval(syncTimer);
  if (countdownTimer) clearInterval(countdownTimer);
  
  secondsLeft = 30;
  document.getElementById('sync-countdown').innerText = `Sync in ${secondsLeft}s`;
  
  countdownTimer = setInterval(() => {
    secondsLeft--;
    if (secondsLeft < 0) {
      secondsLeft = 30;
    }
    document.getElementById('sync-countdown').innerText = `Sync in ${secondsLeft}s`;
  }, 1000);

  syncTimer = setInterval(fetchData, 30000);
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

  // Generate customized tiebreaker text snippets
  generateTiebreakerTexts();

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

// Tiebreaker sorting comparator for details check
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

// Generate explanations for all participants tied on points
function generateTiebreakerTexts() {
  leaderboardData.forEach(p => {
    const tiedWith = leaderboardData.filter(o => o.name !== p.name && o.totalPoints === p.totalPoints);
    if (tiedWith.length === 0) {
      p.tiebreakerExplanationHTML = "";
      return;
    }

    let html = `
      <div class="mt-3.5 p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-300">
        <div class="font-bold text-emerald-400 mb-2 flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
          <svg class="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          Tiebreaker Analysis (Tied at ${p.totalPoints} pts)
        </div>
        <ul class="space-y-2 list-none pl-0">
    `;

    tiedWith.forEach(o => {
      let reason = "";
      const diff = compareTiebreakers(p, o);
      const signP = p.totalGD > 0 ? "+" : "";
      const signO = o.totalGD > 0 ? "+" : "";
      
      if (diff < 0) {
        // p is ranked HIGHER than o
        if (p.totalGoals !== o.totalGoals) {
          reason = `<span class="text-emerald-400 font-bold">wins</span> the tiebreaker over <span class="text-slate-100 font-semibold">${o.name}</span> on total goals scored (${p.totalGoals} vs ${o.totalGoals}).`;
        } else {
          reason = `<span class="text-emerald-400 font-bold">wins</span> the tiebreaker over <span class="text-slate-100 font-semibold">${o.name}</span> on goal differential (${signP}${p.totalGD} vs ${signO}${o.totalGD}) because they have the same total goals (${p.totalGoals}).`;
        }
      } else if (diff > 0) {
        // p is ranked LOWER than o
        if (p.totalGoals !== o.totalGoals) {
          reason = `<span class="text-rose-400 font-bold">loses</span> the tiebreaker to <span class="text-slate-100 font-semibold">${o.name}</span> because ${o.name} has more total goals (${o.totalGoals} vs ${p.totalGoals}).`;
        } else {
          reason = `<span class="text-rose-400 font-bold">loses</span> the tiebreaker to <span class="text-slate-100 font-semibold">${o.name}</span> on goal differential (${signP}${p.totalGD} vs ${signO}${o.totalGD}) with equal goals (${p.totalGoals}).`;
        }
      } else {
        // Completely tied
        reason = `<span class="text-amber-400 font-semibold">is completely tied</span> with <span class="text-slate-100 font-semibold">${o.name}</span> (same goals: ${p.totalGoals}, GD: ${signP}${p.totalGD}).`;
      }

      html += `
        <li class="flex items-start gap-1.5 text-[11px] leading-relaxed">
          <span class="text-slate-500 mt-0.5">•</span>
          <span>${p.name} ${reason}</span>
        </li>
      `;
    });

    html += `</ul></div>`;
    p.tiebreakerExplanationHTML = html;
  });
}

// Update Quick Stats widgets
function updateSummaryCards(summary) {
  document.getElementById('summary-leader').innerText = summary.leaderName;
  document.getElementById('summary-leader-pts').innerText = `${summary.leaderPts} PTS`;
  document.getElementById('summary-matches').innerText = summary.completedMatches;
  document.getElementById('summary-goals').innerText = summary.totalGoals;
}

// Render leaderboard rows to DOM
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

  if (filtered.length === 0 && leaderboardData.length > 0) {
    document.getElementById('empty-state').classList.remove('hidden');
    container.innerHTML = '';
    return;
  } else {
    document.getElementById('empty-state').classList.add('hidden');
  }

  container.innerHTML = filtered.map(p => {
    const team1 = p.teams[0];
    const team2 = p.teams[1];
    
    const flag1 = FLAG_MAP[team1.name] || "🏳️";
    const flag2 = FLAG_MAP[team2.name] || "🏳️";
    
    // Stylize ranks
    let rankBadgeClass = "bg-slate-800 text-slate-300";
    let rankBadgeContent = p.rank;
    let rowBorderClass = "border-slate-800/60";
    
    if (p.rank === 1) {
      rankBadgeClass = "bg-gradient-to-br from-amber-300 to-yellow-500 text-slate-950 font-bold";
      rowBorderClass = "border-yellow-500/20";
    } else if (p.rank === 2) {
      rankBadgeClass = "bg-gradient-to-br from-slate-300 to-slate-400 text-slate-950 font-bold";
      rowBorderClass = "border-slate-400/20";
    } else if (p.rank === 3) {
      rankBadgeClass = "bg-gradient-to-br from-amber-600 to-amber-700 text-slate-100 font-bold";
      rowBorderClass = "border-amber-700/20";
    }

    const gd1 = team1.gd > 0 ? `+${team1.gd}` : team1.gd;
    const gd2 = team2.gd > 0 ? `+${team2.gd}` : team2.gd;
    
    const team1EliminatedClass = team1.eliminated ? 'opacity-40 line-through decoration-rose-500/50' : '';
    const team2EliminatedClass = team2.eliminated ? 'opacity-40 line-through decoration-rose-500/50' : '';
    
    const activeCount = (!team1.eliminated ? 1 : 0) + (!team2.eliminated ? 1 : 0);
    let activeBadgeHTML = '';
    if (activeCount === 2) {
      activeBadgeHTML = `<span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold px-1.5 py-0.5 rounded-md ml-2 uppercase">2 Active</span>`;
    } else if (activeCount === 1) {
      activeBadgeHTML = `<span class="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] font-bold px-1.5 py-0.5 rounded-md ml-2 uppercase">1 Active</span>`;
    } else {
      activeBadgeHTML = `<span class="bg-slate-800 text-slate-500 border border-slate-700/50 text-[9px] font-bold px-1.5 py-0.5 rounded-md ml-2 uppercase">Out</span>`;
    }

    return `
      <div class="bg-slate-900/60 border ${rowBorderClass} rounded-2xl overflow-hidden glass-card transition-all duration-200">
        
        <!-- Row Click Header -->
        <div class="flex items-center justify-between px-4 py-4 cursor-pointer hover:bg-slate-800/25 active:bg-slate-800/40 select-none transition-all" onclick="toggleParticipantRow(this)">
          <div class="flex items-center gap-4">
            <span class="w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${rankBadgeClass}">${rankBadgeContent}</span>
            <div class="flex flex-col">
              <span class="font-bold text-slate-100 text-sm tracking-tight flex items-center">
                ${p.name}
                ${activeBadgeHTML}
              </span>
              <span class="text-[10px] text-slate-400 font-semibold tracking-wide mt-0.5 flex gap-1 items-center">
                ${flag1} ${team1.name} • ${flag2} ${team2.name}
              </span>
            </div>
          </div>
          
          <div class="flex items-center gap-3">
            <div class="bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/25 px-3 py-1 rounded-full text-xs shadow-inner shadow-emerald-500/5">
              ${p.totalPoints} <span class="text-[9px] font-medium text-emerald-500/80">PTS</span>
            </div>
            <svg class="w-4 h-4 text-slate-500 transition-transform duration-300 accordion-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path>
            </svg>
          </div>
        </div>

        <!-- Accordion Drawer -->
        <div class="accordion-content bg-slate-950/40 border-t border-slate-900/50">
          <div class="px-4 pb-4 pt-1 space-y-4">
            
            <!-- Grid of 2 Drafted Teams -->
            <div class="grid grid-cols-2 gap-3">
              
              <!-- Team A Card -->
              <div class="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between">
                <div>
                  <div class="flex items-center gap-2 mb-1.5 truncate">
                    <span class="text-2xl flex-shrink-0">${flag1}</span>
                    <span class="font-bold text-slate-200 text-xs tracking-tight truncate ${team1EliminatedClass}">${team1.name}</span>
                  </div>
                  <div class="text-[10px] text-slate-400 flex flex-wrap gap-1 items-center font-medium">
                    Round: <span class="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[9px] font-semibold">${formatDisplayRound(team1.round)}</span>
                    ${team1.eliminated ? '<span class="bg-rose-950/40 border border-rose-900/50 text-rose-400 font-bold px-1 rounded text-[8px] uppercase">OUT</span>' : '<span class="bg-emerald-950/40 border border-emerald-900/50 text-emerald-400 font-bold px-1 rounded text-[8px] uppercase">ALIVE</span>'}
                  </div>
                </div>
                <div class="grid grid-cols-3 gap-1 mt-3.5 pt-2 border-t border-slate-800 text-center">
                  <div>
                    <div class="text-[9px] uppercase tracking-wider text-slate-500 font-bold">PTS</div>
                    <div class="text-xs font-bold text-emerald-400">+${team1.points}</div>
                  </div>
                  <div>
                    <div class="text-[9px] uppercase tracking-wider text-slate-500 font-bold">GLS</div>
                    <div class="text-xs font-bold text-slate-200">${team1.goals}</div>
                  </div>
                  <div>
                    <div class="text-[9px] uppercase tracking-wider text-slate-500 font-bold">GD</div>
                    <div class="text-xs font-bold ${team1.gd > 0 ? 'text-blue-400' : team1.gd < 0 ? 'text-rose-400' : 'text-slate-400'}">${gd1}</div>
                  </div>
                </div>
              </div>

              <!-- Team B Card -->
              <div class="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between">
                <div>
                  <div class="flex items-center gap-2 mb-1.5 truncate">
                    <span class="text-2xl flex-shrink-0">${flag2}</span>
                    <span class="font-bold text-slate-200 text-xs tracking-tight truncate ${team2EliminatedClass}">${team2.name}</span>
                  </div>
                  <div class="text-[10px] text-slate-400 flex flex-wrap gap-1 items-center font-medium">
                    Round: <span class="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[9px] font-semibold">${formatDisplayRound(team2.round)}</span>
                    ${team2.eliminated ? '<span class="bg-rose-950/40 border border-rose-900/50 text-rose-400 font-bold px-1 rounded text-[8px] uppercase">OUT</span>' : '<span class="bg-emerald-950/40 border border-emerald-900/50 text-emerald-400 font-bold px-1 rounded text-[8px] uppercase">ALIVE</span>'}
                  </div>
                </div>
                <div class="grid grid-cols-3 gap-1 mt-3.5 pt-2 border-t border-slate-800 text-center">
                  <div>
                    <div class="text-[9px] uppercase tracking-wider text-slate-500 font-bold">PTS</div>
                    <div class="text-xs font-bold text-emerald-400">+${team2.points}</div>
                  </div>
                  <div>
                    <div class="text-[9px] uppercase tracking-wider text-slate-500 font-bold">GLS</div>
                    <div class="text-xs font-bold text-slate-200">${team2.goals}</div>
                  </div>
                  <div>
                    <div class="text-[9px] uppercase tracking-wider text-slate-500 font-bold">GD</div>
                    <div class="text-xs font-bold ${team2.gd > 0 ? 'text-blue-400' : team2.gd < 0 ? 'text-rose-400' : 'text-slate-400'}">${gd2}</div>
                  </div>
                </div>
              </div>

            </div>

            <!-- Combined Summary Card Stats -->
            <div class="grid grid-cols-2 gap-4 py-2 px-3 bg-slate-900/40 border border-slate-800/80 rounded-xl text-[10px] font-medium text-slate-400">
              <div class="flex justify-between items-center">
                <span>Combined Goals:</span>
                <span class="font-bold text-slate-200 text-xs">${p.totalGoals}</span>
              </div>
              <div class="flex justify-between items-center border-l border-slate-800 pl-4">
                <span>Combined GD:</span>
                <span class="font-bold text-slate-200 text-xs">${p.totalGD > 0 ? '+' + p.totalGD : p.totalGD}</span>
              </div>
            </div>

            <!-- Dynamic Tiebreaker Alert Section -->
            ${p.tiebreakerExplanationHTML || ''}

          </div>
        </div>

      </div>
    `;
  }).join('');
}

// Toggle row detail panel (Single Expand Mode)
function toggleParticipantRow(element) {
  const container = element.parentElement;
  const content = element.nextElementSibling;
  const chevron = element.querySelector('.accordion-chevron');
  
  const isOpen = content.style.maxHeight !== '0px' && content.style.maxHeight !== '';

  // Collapse all other accordion cards
  document.querySelectorAll('.accordion-content').forEach(el => {
    if (el !== content) {
      el.style.maxHeight = '0px';
      const otherChevron = el.previousElementSibling.querySelector('.accordion-chevron');
      if (otherChevron) otherChevron.style.transform = 'rotate(0deg)';
      el.parentElement.classList.remove('ring-1', 'ring-emerald-500/20');
    }
  });

  // Toggle current
  if (!isOpen) {
    content.style.maxHeight = content.scrollHeight + 'px';
    if (chevron) chevron.style.transform = 'rotate(180deg)';
    container.classList.add('ring-1', 'ring-emerald-500/20');
  } else {
    content.style.maxHeight = '0px';
    if (chevron) chevron.style.transform = 'rotate(0deg)';
    container.classList.remove('ring-1', 'ring-emerald-500/20');
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
  initTimers();
});
