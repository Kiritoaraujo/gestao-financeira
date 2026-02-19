// ======================================================
// 1. CONFIGURAÇÃO DO SUPABASE
// ======================================================
const supabaseUrl = 'https://qfdxiagejhioyzxmibse.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmZHhpYWdlamhpb3l6eG1pYnNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NTY2OTYsImV4cCI6MjA4NzAzMjY5Nn0.5--Pv6XPHmHDgRbvm82uprrWFIulju6sDPycNU3W8Cc';

// Cria a conexão com o banco
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// ======================================================
// 2. VARIÁVEIS GLOBAIS
// ======================================================
let usuarioAtual = null;
let transacoes = [];
let metas = [];
let horasTotaisCLT = 0;

// ======================================================
// 3. UTILITÁRIOS GERAIS
// ======================================================
function showToast(msg, type = 'info') {
    const box = document.getElementById('toast-box');
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.innerText = msg;
    box.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

function getHojeBR() {
    const d = new Date();
    return d.toLocaleDateString('pt-BR');
}

function formatarMoedaBR(valor) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function mudarTela(idTela) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.getElementById(idTela).classList.add('active');
}

function carregarTema() {
    if (localStorage.getItem('temaDark') === 'true') {
        document.body.classList.add('dark-mode');
    }
}

function alternarTema() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('temaDark', isDark);
}

function getSaudacao() {
    const hora = new Date().getHours();
    if (hora < 12) return 'Bom dia';
    else if (hora < 18) return 'Boa tarde';
    else return 'Boa noite';
}

// ======================================================
// 4. AUTENTICAÇÃO E INICIALIZAÇÃO
// ======================================================
async function init() {
    carregarTema();
    // Verifica se já existe uma sessão ativa (usuário logado) no Supabase
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
        await carregarPerfil(session.user);
    } else {
        mudarTela('screen-login');
    }
}

async function fazerCadastro(e) {
    e.preventDefault();
    const nome = document.getElementById('cad-nome').value.trim();
    const email = document.getElementById('cad-email').value.toLowerCase().trim();
    const pass = document.getElementById('cad-pass').value;
    const pass2 = document.getElementById('cad-pass2').value;

    if (!nome || !email || !pass) return showToast("Preencha todos os campos!", 'danger');
    if (pass !== pass2) return showToast("As senhas não conferem!", 'danger');
    if (pass.length < 6) return showToast("Senha deve ter no mínimo 6 caracteres.", 'danger');

    showToast("Processando cadastro...", 'info');

    // Cria a conta no sistema de Autenticação
    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: pass,
    });

    if (error) {
        return showToast("Erro: " + error.message, 'danger');
    }

    // Salva o nome e status no banco de dados para o Admin poder ver
    if (data.user) {
        await supabase.from('profiles').insert([{
            id: data.user.id,
            nome: nome,
            email: email,
            is_admin: false // Mude manualmente para true no Supabase para criar seu primeiro admin
        }]);
    }

    showToast("Conta criada com sucesso! Faça login.", 'success');
    document.getElementById('form-cadastro').reset();
    mudarTela('screen-login');
}

async function fazerLogin(e) {
    e.preventDefault();
    const emailInput = document.getElementById('log-user').value.trim().toLowerCase();
    const pass = document.getElementById('log-pass').value;

    if (!emailInput || !pass) return showToast("Preencha usuário e senha!", 'danger');

    showToast("Autenticando...", 'info');

    const { data, error } = await supabase.auth.signInWithPassword({
        email: emailInput,
        password: pass
    });

    if (error) {
        return showToast("Usuário ou senha incorretos.", 'danger');
    }

    await carregarPerfil(data.user);
}

async function carregarPerfil(userAuth) {
    // Busca os dados extras (nome e se é admin) na tabela profiles
    const { data: perfil, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userAuth.id)
        .single();

    if (error || !perfil) {
        showToast("Erro ao carregar os dados do perfil.", 'danger');
        return logout();
    }

    usuarioAtual = perfil;
    
    if (usuarioAtual.is_admin) {
        await renderizarAdmin();
        mudarTela('screen-admin');
        showToast("Painel Administrativo Iniciado.");
    } else {
        await carregarDadosFinanceiros();
        mudarTela('screen-dashboard');
        const saudacao = getSaudacao();
        document.getElementById('saudacao').innerText = saudacao;
        document.getElementById('display-nome').innerText = usuarioAtual.nome.split(' ')[0];
        showToast(`${saudacao}, ${usuarioAtual.nome.split(' ')[0]}!`, 'success');
    }
}

async function logout() {
    await supabase.auth.signOut();
    usuarioAtual = null;
    transacoes = [];
    metas = [];
    mudarTela('screen-login');
    document.getElementById('log-user').value = '';
    document.getElementById('log-pass').value = '';
}

async function recuperarSenha(e) {
    e.preventDefault();
    const emailInput = document.getElementById('rec-email').value.trim().toLowerCase();
    
    const { error } = await supabase.auth.resetPasswordForEmail(emailInput);
    
    if (error) {
        showToast("Erro: " + error.message, "danger");
    } else {
        showToast("E-mail de recuperação enviado!", "success");
        mudarTela('screen-login');
    }
}

// ======================================================
// 5. CARREGAR DADOS DO BANCO
// ======================================================
async function carregarDadosFinanceiros() {
    // Busca transações apenas do usuário logado
    const { data: transData } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', usuarioAtual.id)
        .order('id', { ascending: false });

    transacoes = (transData || []).map(t => ({
        ...t, val: Number(t.amount), desc: t.description, tipo: t.type, data: t.date, isMeta: t.is_meta
    }));
        
    // Busca metas apenas do usuário logado
    const { data: metasData } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', usuarioAtual.id);

    metas = (metasData || []).map(m => ({
        ...m, nome: m.name, alvo: Number(m.target), atual: Number(m.current)
    }));

    atualizarDashboard();
    renderizarExtrato();
    renderizarCofre();
}

// ======================================================
// 6. TRANSAÇÕES E EXTRATO
// ======================================================
function abrirLancamento() {
    document.getElementById('lanc-desc').value = '';
    document.getElementById('lanc-val').value = '';
    document.getElementById('lanc-data').valueAsDate = new Date();
    setTipo('despesa');
    mudarTela('screen-lancamento');
}

function setTipo(tipo) {
    document.getElementById('lanc-tipo').value = tipo;
    document.getElementById('btn-rec').className = tipo === 'receita' ? "t-btn active rec" : "t-btn";
    document.getElementById('btn-desp').className = tipo === 'despesa' ? "t-btn active desp" : "t-btn";
}

async function salvarLancamento(e) {
    e.preventDefault();
    const dataStr = document.getElementById('lanc-data').value;
    const [ano, mes, dia] = dataStr.split('-');
    
    const novaTransacaoDB = {
        user_id: usuarioAtual.id,
        description: document.getElementById('lanc-desc').value,
        amount: parseFloat(document.getElementById('lanc-val').value),
        date: `${dia}/${mes}/${ano}`,
        type: document.getElementById('lanc-tipo').value,
        is_meta: false
    };

    // Salva na Nuvem
    const { data, error } = await supabase.from('transactions').insert([novaTransacaoDB]).select();

    if (error) {
        return showToast("Erro ao salvar: " + error.message, "danger");
    }

    // Atualiza a tela localmente sem precisar recarregar tudo do banco
    const tNova = data[0];
    transacoes.unshift({ 
        ...tNova, val: Number(tNova.amount), desc: tNova.description, 
        tipo: tNova.type, data: tNova.date, isMeta: tNova.is_meta 
    });

    showToast("Lançamento salvo!");
    mudarTela('screen-dashboard');
    atualizarDashboard();
    renderizarExtrato();
}

async function apagarTransacao(id) {
    if (confirm("Deseja realmente apagar esta movimentação?")) {
        const { error } = await supabase.from('transactions').delete().eq('id', id);
        
        if (error) {
            return showToast("Erro ao apagar.", "danger");
        }

        transacoes = transacoes.filter(t => t.id !== id);
        renderizarExtrato();
        atualizarDashboard(); 
        showToast("Movimentação apagada.");
    }
}

function getSaldo() {
    return transacoes.reduce((acc, t) => t.tipo === 'receita' ? acc + t.val : acc - t.val, 0);
}

function atualizarDashboard() {
    document.getElementById('dash-saldo').innerText = formatarMoedaBR(getSaldo());
    const lista = document.getElementById('dash-lista');
    lista.innerHTML = '';
    
    if (transacoes.length === 0) {
        lista.innerHTML = '<div class="empty-msg">Nenhuma atividade recente.</div>';
    } else {
        transacoes.slice(0, 3).forEach(t => lista.appendChild(criarItemHTML(t, false)));
    }
}

function renderizarExtrato() {
    const lista = document.getElementById('extrato-lista');
    lista.innerHTML = '';
    if (transacoes.length === 0) {
        lista.innerHTML = '<div class="empty-msg">Seu extrato está vazio.</div>';
    } else {
        transacoes.forEach(t => lista.appendChild(criarItemHTML(t, true)));
    }
}

function criarItemHTML(t, permitirDelete) {
    const div = document.createElement('div');
    div.className = 'transacao-item';
    let icone = t.tipo === 'receita' ? 'fa-arrow-up' : 'fa-arrow-down';
    let classeCor = t.tipo === 'receita' ? 'c-in' : 'c-out';
    
    if (t.isMeta) {
        icone = 'fa-piggy-bank';
        classeCor = 'c-meta';
    }

    const btnDel = permitirDelete ? `<button class="btn-del" onclick="apagarTransacao(${t.id})"><i class="fas fa-trash"></i></button>` : '';
    
    div.innerHTML = `
        <div class="t-icon ${classeCor}"><i class="fas ${icone}"></i></div>
        <div class="t-info"><span class="t-title">${t.desc}</span><span class="t-date">${t.data}</span></div>
        <div class="t-val ${t.tipo === 'receita' ? 'val-pos' : 'val-neg'}">${t.tipo === 'receita' ? '+' : '-'} ${formatarMoedaBR(t.val)}</div>
        ${btnDel}
    `;
    return div;
}

// ======================================================
// 7. COFRE (Metas)
// ======================================================
async function salvarMeta(e) {
    e.preventDefault();
    const novaMetaDB = {
        user_id: usuarioAtual.id,
        name: document.getElementById('meta-nome').value,
        target: parseFloat(document.getElementById('meta-alvo').value),
        current: 0
    };

    const { data, error } = await supabase.from('goals').insert([novaMetaDB]).select();

    if (error) return showToast("Erro ao criar meta.", "danger");

    const mNova = data[0];
    metas.push({ ...mNova, nome: mNova.name, alvo: Number(mNova.target), atual: Number(mNova.current) });
    
    showToast("Meta criada com sucesso!");
    document.getElementById('form-meta').reset();
    mudarTela('screen-cofre');
    renderizarCofre();
}

function renderizarCofre() {
    const lista = document.getElementById('cofre-lista');
    lista.innerHTML = '';
    if (metas.length === 0) {
        lista.innerHTML = '<div class="empty-msg">Nenhuma meta criada.</div>';
        return;
    }

    metas.forEach(m => {
        const pct = Math.min((m.atual / m.alvo) * 100, 100).toFixed(1);
        lista.innerHTML += `
            <div style="background:var(--bg-card); padding:15px; border-radius:15px; margin-bottom:15px; box-shadow:0 3px 10px var(--shadow);">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong>${m.nome}</strong>
                    <button class="btn-del" onclick="apagarMeta(${m.id})"><i class="fas fa-trash"></i></button>
                </div>
                <div style="background:var(--bg-body); height:10px; border-radius:5px; margin:10px 0; overflow:hidden;">
                    <div style="background:var(--primary); width:${pct}%; height:100%; transition:0.3s;"></div>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-sec);">
                    <span>${formatarMoedaBR(m.atual)} de ${formatarMoedaBR(m.alvo)} (${pct}%)</span>
                </div>
                <button class="btn-primary" style="margin-top:10px; padding:8px; font-size:13px;" onclick="adicionarFundos(${m.id})">Guardar Dinheiro</button>
            </div>
        `;
    });
}

async function apagarMeta(id) {
    if (confirm("Deseja apagar esta meta?")) {
        const { error } = await supabase.from('goals').delete().eq('id', id);
        if (!error) {
            metas = metas.filter(m => m.id !== id);
            renderizarCofre();
            showToast("Meta apagada.");
        }
    }
}

async function adicionarFundos(id) {
    const valStr = prompt("Quanto deseja guardar nesta meta?");
    if (!valStr) return;
    const val = parseFloat(valStr.replace(',', '.'));
    
    if (isNaN(val) || val <= 0) return showToast("Valor inválido.");
    if (val > getSaldo()) return showToast("Você não tem saldo suficiente na conta!");

    const meta = metas.find(m => m.id === id);
    if (meta) {
        meta.atual += val;
        
        // Atualiza a meta no Banco
        await supabase.from('goals').update({ current: meta.atual }).eq('id', id);

        // Registra a saída no extrato (Dinheiro saindo do saldo para a meta)
        const novaTDB = {
            user_id: usuarioAtual.id,
            description: `Guardado no Cofre: ${meta.nome}`,
            amount: val,
            date: getHojeBR(),
            type: 'despesa',
            is_meta: true
        };
        
        const { data } = await supabase.from('transactions').insert([novaTDB]).select();
        const tNova = data[0];

        transacoes.unshift({ ...tNova, val: Number(tNova.amount), desc: tNova.description, tipo: tNova.type, data: tNova.date, isMeta: tNova.is_meta });
        
        renderizarCofre();
        atualizarDashboard();
        renderizarExtrato();
        showToast("Dinheiro guardado no cofre!");
    }
}

// ======================================================
// 8. PAINEL ADMINISTRADOR (Atualizado)
// ======================================================
async function renderizarAdmin() {
    // Busca todos os usuários
    const { data: profiles } = await supabase.from('profiles').select('*');
    // Busca todas as transações globais do sistema
    const { data: transactions } = await supabase.from('transactions').select('*');

    document.getElementById('adm-total-users').innerText = profiles ? profiles.length : 0;
    
    const totalMovimentado = transactions ? transactions.reduce((acc, t) => acc + Number(t.amount), 0) : 0;
    document.getElementById('adm-total-money').innerText = formatarMoedaBR(totalMovimentado);

    const listaUser = document.getElementById('adm-user-list');
    listaUser.innerHTML = '';
    
    if (profiles) {
        profiles.forEach(p => {
            const tCount = transactions ? transactions.filter(t => t.user_id === p.id).length : 0;
            listaUser.innerHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:var(--bg-card); border-radius:10px; margin-bottom:8px; border:1px solid var(--border); box-shadow:0 2px 5px var(--shadow);">
                    <div style="flex:1;">
                        <div style="font-weight:bold; font-size:14px;">${p.nome} ${p.is_admin ? '<span style="background:#000; color:#fff; font-size:10px; padding:2px 6px; border-radius:4px; margin-left:5px;">ADMIN</span>' : ''}</div>
                        <div style="font-size:12px; color:var(--text-sec);">${p.email}</div>
                    </div>
                    <div style="font-size:12px; text-align:right;">
                        <strong>${tCount}</strong> lançamentos
                    </div>
                </div>
            `;
        });
    }

    const statusList = document.getElementById('adm-status-list');
    statusList.innerHTML = '';
    
    if (transactions) {
        const ultimasGlobais = transactions.sort((a,b) => b.id - a.id).slice(0, 10);
        if (ultimasGlobais.length === 0) {
            statusList.innerHTML = '<div class="empty-msg">Nenhuma transação no sistema.</div>';
        } else {
            ultimasGlobais.forEach(t => {
                const userTrans = profiles.find(u => u.id === t.user_id)?.nome || 'Desconhecido';
                const icone = t.type === 'receita' ? 'fa-arrow-up c-in' : 'fa-arrow-down c-out';
                const valClass = t.type === 'receita' ? 'val-pos' : 'val-neg';
                
                statusList.innerHTML += `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:var(--bg-card); border-radius:10px; margin-bottom:8px; border:1px solid var(--border);">
                        <div>
                            <div style="font-size:14px;"><i class="fas ${icone}"></i> <strong>${t.description}</strong></div>
                            <div style="font-size:11px; color:var(--text-sec); margin-top:3px;">Por: ${userTrans} • ${t.date}</div>
                        </div>
                        <div class="${valClass}" style="font-weight:bold;">
                            ${formatarMoedaBR(Number(t.amount))}
                        </div>
                    </div>
                `;
            });
        }
    }
}

function alternarAbaAdm(aba) {
    document.getElementById('aba-usuarios').style.display = 'none';
    document.getElementById('aba-financeiro').style.display = 'none';
    document.getElementById('btn-aba-user').classList.remove('active');
    document.getElementById('btn-aba-fin').classList.remove('active');

    if(aba === 'usuarios') {
        document.getElementById('aba-usuarios').style.display = 'block';
        document.getElementById('btn-aba-user').classList.add('active');
    } else {
        document.getElementById('aba-financeiro').style.display = 'block';
        document.getElementById('btn-aba-fin').classList.add('active');
    }
}

// Inicia a aplicação automaticamente
window.onload = init;