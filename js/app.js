// --- (Dosyanın başındaki değişkenler aynen kalıyor) ---
const BAKIM_MODU = false;
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycby3kd04k2u9XdVDD1-vdbQQAsHNW6WLIn8bNYxTlVCL3U1a0WqZo6oPp9zfBWIpwJEinQ/exec";

// --- OYUN DEĞİŞKENLERİ ---
let jokers = { call: 1, half: 1, double: 1 };
let doubleChanceUsed = false;
let firstAnswerIndex = -1;
let pScore = 0, pBalls = 10, pCurrentQ = null;

const VALID_CATEGORIES = ['Teknik', 'İkna', 'Kampanya', 'Bilgi'];
const MONTH_NAMES = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

// --- GLOBAL DEĞİŞKENLER ---
let database = [], newsData = [], sportsData = [], salesScripts = [], quizQuestions = [];
let currentUser = "";
let isAdminMode = false;
let isEditingActive = false;
let sessionTimeout;
let activeCards = [];
let currentCategory = 'all';
let adminUserList = [];
let allEvaluationsData = []; // BURASI ÖNEMLİ: Tüm veriler burada tutulacak
let wizardStepsData = {};

// ... (Buradaki Login, Oyun, Wizard, Slider fonksiyonları aynen kalıyor) ...

// --- DASHBOARD GÜNCELLEMELERİ ---

function openQualityArea() {
    document.getElementById('quality-modal').style.display = 'flex';
    document.getElementById('admin-quality-controls').style.display = isAdminMode ? 'flex' : 'none';
    
    // Ay Filtresi (Son 6 ay)
    const selectEl = document.getElementById('month-select-filter');
    selectEl.innerHTML = '';
    const now = new Date();
    for (let i = 0; i < 6; i++) {
        let d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        let val = `${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
        let txt = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
        let opt = document.createElement('option');
        option.value = val; option.textContent = txt;
        if (i === 0) option.selected = true;
        selectEl.appendChild(opt);
    }
    
    if (isAdminMode) {
        fetchUserListForAdmin().then(users => {
            const selectEl = document.getElementById('agent-select-admin');
            // Yönetici için varsayılan 'all' değil, ilk kullanıcı olsun ki grubu belli olsun
            selectEl.innerHTML = users.map(u => `<option value="${u.name}" data-group="${u.group}">${u.name} (${u.group})</option>`).join('');
            
            // Yönetici tüm verileri çekmeli ki sıralama yapabilsin
            fetchEvaluationsForAgent('all'); 
        });
    } else {
        // Normal kullanıcı sadece kendi verisini çeker ama grup sıralaması için backend desteği yoksa
        // sadece kendi verisiyle sıralama yapamaz. Burada backend'in grup verisi döndüğü varsayılıyor.
        // Veya "all" çekmeye çalışıyoruz (güvenlik varsa backend engeller).
        fetchEvaluationsForAgent('all'); 
    }
}

// Veri Çekme Fonksiyonu
function fetchEvaluationsForAgent(forcedName) {
    const listEl = document.getElementById('evaluations-list-dashboard');
    listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#999;"><i class="fas fa-circle-notch fa-spin"></i> Veriler analiz ediliyor...</div>';
    
    // Eğer yöneticiysek ve 'all' çekiyorsak, veritabanını dolduruyoruz.
    // Eğer bir kişi seçiliyse, sadece filtreleme yapacağız (tekrar fetch etmeye gerek yok).
    
    // İlk yüklemede 'all' çekiyoruz.
    let fetchTarget = 'all'; 
    if(!isAdminMode) fetchTarget = currentUser; // Temsilciyse kendisi (veya grubu)

    // Eğer veri zaten varsa tekrar çekme, sadece UI güncelle
    if(allEvaluationsData.length > 0 && forcedName !== 'refresh') {
        updateDashboardUI();
        return;
    }

    fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "fetchEvaluations", targetAgent: fetchTarget, username: currentUser, token: getToken() })
    }).then(r => r.json()).then(data => {
        if (data.result === "success") {
            allEvaluationsData = data.evaluations;
            updateDashboardUI();
        } else {
            listEl.innerHTML = '<div style="text-align:center; color:red;">Veri alınamadı.</div>';
        }
    }).catch(err => {
        listEl.innerHTML = '<div style="text-align:center; color:red;">Sunucu hatası.</div>';
    });
}

function updateDashboardUI() {
    const monthFilter = document.getElementById('month-select-filter').value;
    let targetUser = currentUser;
    let targetGroup = "";

    if (isAdminMode) {
        const selectEl = document.getElementById('agent-select-admin');
        targetUser = selectEl.value;
        const selectedOption = selectEl.options[selectEl.selectedIndex];
        if(selectedOption) targetGroup = selectedOption.getAttribute('data-group');
    } else {
        // Temsilci modu: Kullanıcının grubunu bulmamız lazım
        // Eğer evaluation datasında grup bilgisi varsa oradan alalım
        const myEval = allEvaluationsData.find(e => e.agent === currentUser || e.agentName === currentUser);
        if(myEval) targetGroup = myEval.group || "";
    }

    // 1. Hedef Kullanıcının KPI Verileri (Sadece O Kişi + O Ay)
    const userFiltered = allEvaluationsData.filter(item => {
        if(!item.date) return false;
        const parts = item.date.split('.'); 
        const isMonthMatch = (parts.length >= 3 && `${parts[1]}.${parts[2]}` === monthFilter);
        const isUserMatch = (item.agent === targetUser || item.agentName === targetUser);
        return isMonthMatch && isUserMatch;
    });

    // KPI Hesaplama
    let totalScore = 0, count = userFiltered.length;
    let scores = userFiltered.map(i => parseInt(i.score)||0);
    if (count > 0) totalScore = scores.reduce((a,b)=>a+b, 0);
    const avg = count > 0 ? (totalScore/count).toFixed(1) : 0;
    const targetRate = count > 0 ? ((scores.filter(s=>s>=90).length/count)*100).toFixed(0) : 0;

    document.getElementById('dash-total-score').innerText = avg;
    document.getElementById('dash-total-score').style.color = avg>=90 ? 'var(--success)' : (avg>=80 ? 'var(--warning)' : 'var(--accent)');
    document.getElementById('dash-total-count').innerText = count;
    document.getElementById('dash-target-rate').innerText = `%${targetRate}`;

    // LİSTELEME VE GRUP SIRALAMASI
    const listEl = document.getElementById('evaluations-list-dashboard');
    listEl.innerHTML = '';
    
    const rankBody = document.getElementById('group-ranking-body');
    rankBody.innerHTML = '';

    // SOL TARAF: ÇAĞRI LİSTESİ (FULL LİSTE)
    if(count === 0) {
        listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#ccc;">Bu dönem kayıt yok.</div>';
    } else {
        const sortedList = filtered.slice().reverse();
        sortedList.forEach(item => {
            let badgeClass = item.score >= 90 ? 'score-green' : (item.score >= 70 ? 'score-yellow' : 'score-red');
            let html = `
                <div class="dash-list-item" onclick="showEvaluationDetail('${item.callId}')" style="cursor:pointer;">
                    <div>
                        <div style="font-weight:bold; color:#333;">${item.callId || 'ID Yok'}</div>
                        <div style="font-size:0.75rem; color:#999;">${item.date}</div>
                    </div>
                    <div>
                        <span class="dash-score-badge ${badgeClass}">${item.score}</span>
                        <i class="fas fa-chevron-right" style="font-size:0.8rem; color:#ccc; margin-left:10px;"></i>
                    </div>
                </div>`;
            listEl.innerHTML += html;
        });
    }

    // SAĞ TARAF: GRUP SIRALAMASI
    // 1. Hedef Kişinin Grubunu Bul
    let targetGroup = "";
    if(isAdminMode) {
        const sel = document.getElementById('agent-select-admin');
        const opt = sel.options[sel.selectedIndex];
        if(opt) targetGroup = opt.getAttribute('data-group');
    } else {
        // Normal kullanıcı için kendi grubunu bulmaya çalış (veriden)
        const myData = allEvaluationsData.find(d => d.agent === currentUser || d.agentName === currentUser);
        if(myData) targetGroup = myData.group; 
    }
    
    document.getElementById('ranking-group-name').innerText = targetGroup ? `(${targetGroup})` : '';

    if(!targetGroup) {
        rankBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:10px; color:#999;">Grup bilgisi yok.</td></tr>';
    } else {
        // 2. O gruptaki o ayki tüm verileri bul
        const groupData = allEvaluationsData.filter(item => {
            if(!item.date) return false;
            const parts = item.date.split('.');
            const isMonth = (parts.length >= 3 && `${parts[1]}.${parts[2]}` === monthFilter);
            // Grup kontrolü: Veri içinde group alanı varsa veya admin listesinden eşleştirme
            // Basitlik için veri içindeki 'group' alanını veya admin listesinden check edelim
            let itemGroup = item.group; 
            // Eğer veride group yoksa adminUserList'ten bul (Admin modunda yüklü olur)
            if(!itemGroup && adminUserList.length > 0) {
                const u = adminUserList.find(u => u.name === (item.agent || item.agentName));
                if(u) itemGroup = u.group;
            }
            return isMonth && itemGroup === targetGroup;
        });

        // 3. Kişi bazlı ortalama hesapla
        let agentStats = {};
        groupData.forEach(d => {
            let name = d.agent || d.agentName;
            if(!agentStats[name]) agentStats[name] = { total: 0, count: 0 };
            agentStats[name].total += (parseInt(d.score)||0);
            agentStats[name].count++;
        });

        // 4. Sıralama Array'i oluştur
        let ranking = Object.keys(agentStats).map(name => {
            return {
                name: name,
                avg: (agentStats[name].total / agentStats[name].count).toFixed(1),
                count: agentStats[name].count
            };
        }).sort((a,b) => b.avg - a.avg);

        // 5. Tabloyu Doldur
        if(ranking.length === 0) {
            rankBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:10px; color:#999;">Veri yok.</td></tr>';
        } else {
            ranking.forEach((r, idx) => {
                let rankIcon = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : `#${idx+1}`));
                let highlight = (r.name === (isAdminMode ? document.getElementById('agent-select-admin').value : currentUser)) ? 'background:#fff8e1;' : '';
                
                rankBody.innerHTML += `
                <tr style="border-bottom:1px solid #eee; ${highlight}">
                    <td style="padding:8px; font-weight:bold;">${rankIcon}</td>
                    <td style="padding:8px; font-size:0.8rem;">${r.name}</td>
                    <td style="padding:8px; text-align:right; font-weight:bold;">${r.avg}</td>
                </tr>`;
            });
        }
    }
}

// YENİ: Detay Görüntüleme Fonksiyonu
    } catch(e) { detailHtml = `<p>${item.details}</p>`; }

    let editBtn = isAdminMode ? `<button onclick="editEvaluation('${item.callId}')" style="margin-top:15px; padding:10px; width:100%; background:#0e1b42; color:white; border:none; border-radius:5px; cursor:pointer;"><i class="fas fa-edit"></i> Düzenle</button>` : '';

    Swal.fire({
        title: `Detaylar (ID: ${item.callId})`,
        html: `
            <div style="text-align:left;">
                <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                    <span><strong>Tarih:</strong> ${item.date}</span>
                    <span style="font-size:1.2rem; font-weight:bold; color:${item.score>=90?'green':'red'}">${item.score} Puan</span>
                </div>
                ${detailHtml}
                <div style="margin-top:15px; background:#f9f9f9; padding:10px; border-radius:5px;">
                    <strong>Geri Bildirim:</strong><br>${item.feedback || '-'}
                </div>
                ${editBtn}
            </div>
        `,
        showConfirmButton: false,
        showCloseButton: true
    });
}

// ... (Diğer tüm CRUD, Edit, Log fonksiyonları orijinal app.js'deki gibi kalacak) ...
