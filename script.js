// ======================================================
// 1. CONFIGURAÇÃO DO SUPABASE
// ======================================================
const supabaseUrl = 'https://qfdxiagejhioyzxmibse.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmZHhpYWdlamhpb3l6eG1pYnNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NTY2OTYsImV4cCI6MjA4NzAzMjY5Nn0.5--Pv6XPHmHDgRbvm82uprrWFIulju6sDPycNU3W8Cc';

const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// ======================================================
// 2. VARIÁVEIS GLOBAIS
// ======================================================
let usuarioAtual = null;
let transacoes = [];
let metas = [];

// ======================================================
// 3. FUNÇÕES DE SUPORTE
// ======================================================
function showToast(msg, type = 'info') {
    const box = document.getElementById('toast-box');
    if (!box) return;
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.innerText = msg;
    box.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

function mudarTela(idTela) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    const tela = document.getElementById(idTela);
    if (tela) tela.classList.add('active');
}

function formatarMoedaBR(valor) {
    return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ======================================================
// 4. AUTENTICAÇÃO (LOGIN E REGISTO)
// ======================================================
async function init() {
    // Verifica se já existe uma sessão iniciada quando a página carrega
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
        await carregarPerfil(session.user);
    } else {
        mudarTela('screen-login');
    }
}

async function fazerCadastro(e) {
    if(e) e.preventDefault();
    
    const email = document.getElementById('cad-email')?.value.trim();
    const senha = document.getElementById('cad-senha')?.value;
    const nome = document.getElementById('cad-nome')?.value.trim();

    if (!email || !senha) return showToast("Preencha o e-mail e a senha!", "danger");

    showToast("A processar registo...", "info");

    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: senha,
    });

    if (error) {
        console.error(error);
        return showToast("Erro no registo: " + error.message, "danger");
    }

    // Regista o perfil extra na base de dados
    if (data.user) {
        await supabase.from('profiles').insert([
            { id: data.user.id, nome: nome || 'Utilizador', email: email, is_admin: false }
        ]);
    }

    showToast("Conta criada com sucesso! Por favor, faça login.", "success");
    document.getElementById('form-cadastro')?.reset();
    mudarTela('screen-login');
}

async function fazerLogin(e) {
    if(e) e.preventDefault();
    
    const email = document.getElementById('log-user')?.value.trim();
    const senha = document.getElementById('log-senha')?.value;

    if (!email || !senha) return showToast("Preencha todos os campos!", "danger");

    showToast("A autenticar...", "info");

    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: senha
    });

    if (error) {
        return showToast("Credenciais incorretas.", "danger");
    }

    await carregarPerfil(data.user);
}

async function carregarPerfil(userAuth) {
    const { data: perfil, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userAuth.id)
        .single();

    if (error || !perfil) {
        usuarioAtual = { id: userAuth.id, email: userAuth.email, is_admin: false, nome: "Utilizador" };
    } else {
        usuarioAtual = perfil;
    }

    // Direciona para o ecrã correto
    if (usuarioAtual.is_admin) {
        mudarTela('screen-admin');
        showToast("Painel de Administração", "success");
    } else {
        mudarTela('screen-dashboard');
        const saudacaoEl = document.getElementById('saudacao');
        if(saudacaoEl) saudacaoEl.innerText = "Olá";
        const nomeEl = document.getElementById('display-nome');
        if(nomeEl) nomeEl.innerText = usuarioAtual.nome;
        showToast(`Bem-vindo, ${usuarioAtual.nome}!`, "success");
    }
}

async function logout() {
    await supabase.auth.signOut();
    usuarioAtual = null;
    mudarTela('screen-login');
}

// Inicia a aplicação automaticamente quando a página carrega
window.onload = init;

// (As restantes funções de adicionar transações e metas podem ser adicionadas depois de garantirmos que o login funciona!)
