// ===============================================
// 1. SUPABASE CLIENT INITIALISIEREN
// ===============================================
const SUPABASE_URL = 'https://gnwhwjhfwzljnbptluji.supabase.co'; // <-- ERSETZEN!
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdud2h3amhmd3psam5icHRsdWppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NjM0ODQsImV4cCI6MjA3NzMzOTQ4NH0.-h4wiRzR42vNxJh0VPyTWeGKrW6kB9E871DazvqvXio'; // <-- ERSETZEN!

if (!window.supabase) {
    alert('Supabase-Client konnte nicht geladen werden. Überprüfe die Internetverbindung oder den Skript-Tag.');
}
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


// ===============================================
// 2. GLOBALE SPIEL-VARIABLEN
// ===============================================
let currentRoll1 = 1;
let currentRoll2 = 1;
let correctSum = currentRoll1 + currentRoll2;
let streakCounter = 0;
let score = 0;
const diceFaces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// --- Timer-Variablen ---
const BASE_DURATION = 10000;
const MIN_DURATION = 1500;
const DURATION_REDUCTION_PER_STREAK = 200;
let currentRoundDuration = BASE_DURATION;
let timerId;
let roundStartTime;

// --- Highscore-Speicher ---
let topHighscores = [];

// NEU: Animationsdauer
const DICE_ROLL_ANIMATION_DURATION = 700; // Millisekunden

// ===============================================
// 3. DOM-ELEMENTE HOLEN
// ===============================================

// --- Spiel-Elemente ---
const die1Element = document.getElementById('die1');
const die2Element = document.getElementById('die2');
const startButton = document.getElementById('startButton');
const sumGrid = document.getElementById('sum-grid');
const feedbackElement = document.getElementById('feedback');
const streakCounterElement = document.getElementById('streak-counter');
const scoreCounterElement = document.getElementById('score-counter');
const sumButtons = [];
const timerBarContainer = document.getElementById('timer-bar-container');
const timerBar = document.getElementById('timer-bar');
const gridTitle = document.getElementById('grid-title');

// --- Highscore- & Modal-Elemente ---
const highscoreList = document.getElementById('highscore-list');
const modalOverlay = document.getElementById('modal-overlay');
const modalScore = document.getElementById('modal-score');
const scoreForm = document.getElementById('score-form');
const nameInput = document.getElementById('name-input');
// (Der home-link muss hier nicht geholt werden, da er kein JS braucht)


// ===============================================
// 4. HIGHSCORE-FUNKTIONEN
// ===============================================

/**
 * Funktion zum Laden der Highscores
 */
async function loadHighscores() {
    const { data, error } = await supabase
        .from('highscores')
        .select('*')
        .order('score', { ascending: false })
        .limit(5); // Lädt Top 5

    if (error) {
        console.error('Fehler beim Laden der Scores:', error);
        highscoreList.innerHTML = '<li>Fehler beim Laden der Scores.</li>';
        return;
    }

    topHighscores = data;

    highscoreList.innerHTML = '';
    if (data.length === 0) {
        highscoreList.innerHTML = '<li>Noch keine Scores vorhanden.</li>';
    }

    data.forEach((entry, index) => {
        const li = document.createElement('li');
        let rank = index + 1;
        if(rank === 1) rank = '🥇';
        else if(rank === 2) rank = '🥈';
        else if(rank === 3) rank = '🥉';
        else rank = `${rank}.`;

        li.innerHTML = `${rank} <strong>${entry.player_name}:</strong> ${entry.score}`;
        highscoreList.appendChild(li);
    });
}

/**
 * Funktion zum Eintragen eines neuen Scores (vom Modal aufgerufen)
 */
async function submitHighscore(event) {
    event.preventDefault();
    const playerNameRaw = nameInput.value.trim();
    const playerNameCheck = playerNameRaw.toLowerCase(); // Zum Vergleichen

    if (!playerNameRaw) {
        alert('Bitte gib einen gültigen Namen ein.');
        return;
    }

    const submitButton = scoreForm.querySelector('button');
    submitButton.disabled = true;
    submitButton.textContent = 'Speichere...';

    const existingEntry = topHighscores.find(entry =>
        entry.player_name.toLowerCase() === playerNameCheck
    );

    let error = null;

    if (existingEntry) {
        if (score > existingEntry.score) {
            // Neuer Score ist BESSER -> UPDATE
            const { error: updateError } = await supabase
                .from('highscores')
                .update({
                    score: score,
                    player_name: playerNameRaw
                })
                .eq('id', existingEntry.id);
            error = updateError;
        } else {
            // Neuer Score ist SCHLECHTER ODER GLEICH -> Nichts tun
            showRestartButton('not_better');

            nameInput.value = '';
            modalOverlay.classList.add('hidden');
            submitButton.disabled = false;
            submitButton.textContent = 'Speichern';
            return;
        }

    } else {
        // Neuer Spieler in den Top 5 -> INSERT
        const { error: insertError } = await supabase
            .from('highscores')
            .insert({
                player_name: playerNameRaw,
                score: score
            });
        error = insertError;
    }

    if (error) {
        console.error('Fehler beim Speichern des Scores:', error);
        alert('Fehler beim Speichern.');
        submitButton.disabled = false;
        submitButton.textContent = 'Speichern';
    } else {
        // Erfolgreich gespeichert!
        nameInput.value = '';
        modalOverlay.classList.add('hidden');
        submitButton.disabled = false;
        submitButton.textContent = 'Speichern';

        loadHighscores();
        showRestartButton('submit');
    }
}

// ===============================================
// 5. SPIEL-FUNKTIONEN
// ===============================================

/**
 * Erstellt das Zahlenraster von 2 bis 12
 */
function createSumGrid() {
    for (let i = 2; i <= 12; i++) {
        const button = document.createElement('button');
        button.classList.add('sum-button');
        button.textContent = i;
        button.dataset.value = i;
        button.addEventListener('click', checkSum);
        sumGrid.appendChild(button);
        sumButtons.push(button);
    }
}

/**
 * Startet das Spiel (oder startet es neu)
 */
function startGame() {
    streakCounter = 0;
    streakCounterElement.textContent = streakCounter;
    score = 0;
    scoreCounterElement.textContent = score;

    feedbackElement.textContent = '';
    feedbackElement.className = '';
    timerBarContainer.style.display = 'block';
    startButton.style.display = 'none';

    gridTitle.style.display = 'block';

    rollDice();
}

/**
 * Funktion für einen neuen Würfelwurf (startet eine neue Runde)
 */
async function rollDice() { // NEU: async, weil wir await für setTimeout nutzen
    cancelAnimationFrame(timerId);

    let reduction = streakCounter * DURATION_REDUCTION_PER_STREAK;
    currentRoundDuration = Math.max(BASE_DURATION - reduction, MIN_DURATION);

    // NEU: Würfel-Animation starten
    die1Element.classList.add('rolling');
    die2Element.classList.add('rolling');
    die1Element.textContent = '?'; // Zeige Fragezeichen während des Rollens
    die2Element.textContent = '?';

    // Kurze Pause für die Animation
    await new Promise(resolve => setTimeout(resolve, DICE_ROLL_ANIMATION_DURATION));

    currentRoll1 = Math.floor(Math.random() * 6) + 1;
    currentRoll2 = Math.floor(Math.random() * 6) + 1;
    correctSum = currentRoll1 + currentRoll2;

    die1Element.textContent = diceFaces[currentRoll1 - 1];
    die2Element.textContent = diceFaces[currentRoll2 - 1];

    // NEU: Würfel-Animation beenden
    die1Element.classList.remove('rolling');
    die2Element.classList.remove('rolling');

    feedbackElement.textContent = '';
    feedbackElement.className = '';

    sumButtons.forEach(btn => btn.disabled = false);

    timerBar.style.transform = 'scaleX(1)';
    timerBar.classList.remove('low');
    roundStartTime = performance.now();
    timerId = requestAnimationFrame(updateTimer);
}

/**
 * Die Timer-Schleife
 */
function updateTimer() {
    const elapsedTime = performance.now() - roundStartTime;
    const remainingTime = currentRoundDuration - elapsedTime;
    const remainingPercent = Math.max(0, remainingTime / currentRoundDuration);

    timerBar.style.transform = `scaleX(${remainingPercent})`;

    if (remainingPercent < 0.3) {
        timerBar.classList.add('low');
    } else {
        timerBar.classList.remove('low');
    }

    if (remainingTime <= 0) {
        endGame('timeout');
    } else {
        timerId = requestAnimationFrame(updateTimer);
    }
}

/**
 * Beendet das Spiel
 */
function endGame(reason) {
    cancelAnimationFrame(timerId);
    sumButtons.forEach(btn => btn.disabled = true);

    // Prüft, ob der Score ein Top 5 Highscore ist
    const minTopScore = (topHighscores.length < 5) ? 0 : topHighscores[topHighscores.length - 1].score;

    if (score > 0 && score >= minTopScore) {
        showHighscoreModal(reason);
    } else {
        showRestartButton(reason);
    }
}

/**
 * Zeigt das Highscore-Eingabe-Modal an
 */
function showHighscoreModal(reason) {
    if (reason === 'timeout') {
        feedbackElement.textContent = `Zeit abgelaufen! Die Summe war ${correctSum}.`;
    } else if (reason === 'wrong') {
        feedbackElement.textContent = `Falsch! Die Summe war ${correctSum}.`;
    }
    feedbackElement.className = 'incorrect';

    modalScore.textContent = score;
    modalOverlay.querySelector('h2').textContent = "Glückwunsch! Top 5!";
    modalOverlay.classList.remove('hidden');
    nameInput.focus();

    gridTitle.style.display = 'none';
}

/**
 * Zeigt den "Neu starten"-Button und die End-Nachricht an
 */
function showRestartButton(reason) {
    if (reason === 'timeout') {
        feedbackElement.textContent = `Zeit abgelaufen! Die Summe war ${correctSum}.`;
    } else if (reason === 'wrong') {
        feedbackElement.textContent = `Falsch! Die Summe war ${correctSum}.`;
    } else if (reason === 'submit') {
        feedbackElement.textContent = `Score gespeichert! Dein Score: ${score}`;
        feedbackElement.className = 'correct';
    } else if (reason === 'not_better') {
        feedbackElement.textContent = `Dein Score (${score}) war nicht besser als dein alter Highscore.`;
        feedbackElement.className = 'info';
    }

    startButton.textContent = 'Neu starten?';
    startButton.style.display = 'block';
    timerBarContainer.style.display = 'none';

    gridTitle.style.display = 'none';
}


/**
 * Überprüft die vom Benutzer geklickte Summe
 */
function checkSum(event) {
    cancelAnimationFrame(timerId);
    const clickedValue = parseInt(event.target.dataset.value);
    sumButtons.forEach(btn => btn.disabled = true);

    if (clickedValue === correctSum) {
        // Richtig!
        const elapsedTime = performance.now() - roundStartTime;
        const remainingTime = currentRoundDuration - elapsedTime;
        const points = Math.floor(remainingTime / 100);
        score += points;
        scoreCounterElement.textContent = score;

        streakCounter++;
        streakCounterElement.textContent = streakCounter;

        feedbackElement.textContent = `Richtig! +${points} Punkte`;
        feedbackElement.className = 'correct';
        setTimeout(rollDice, 1000); // Nächste Runde

    } else {
        // Falsch!
        streakCounter = 0;
        endGame('wrong');
    }
}

// ===============================================
// 6. INITIALISIERUNG / EVENT LISTENERS
// ===============================================

// Das 'defer'-Attribut im HTML sorgt dafür, dass dieser Code erst ausgeführt wird,
// wenn das HTML-Dokument vollständig geladen ist.

createSumGrid();
startButton.addEventListener('click', startGame);
scoreForm.addEventListener('submit', submitHighscore);
// Wir laden die Highscores beim Start, um die 'topHighscores'-Variable zu füllen
loadHighscores();

startButton.disabled = false;
sumButtons.forEach(btn => btn.disabled = true);
feedbackElement.textContent = 'Klicke auf "Spiel starten!", um zu beginnen.';