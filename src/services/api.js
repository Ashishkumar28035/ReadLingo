const API_BASE_URL = "http://localhost:5000/api";

async function request(endpoint, options = {}) {
    const token = localStorage.getItem("token");
    const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || "Something went wrong");
    }

    return data;
}

export function signup(userData) {
    return request("/auth/signup", {
        method: "POST",
        body: JSON.stringify(userData),
    });
}

export function login(credentials) {
    return request("/auth/login", {
        method: "POST",
        body: JSON.stringify(credentials),
    });
}

export function getMe() {
    return request("/auth/me", {
        method: "GET",
    });
}

export function lookupWord(word) {
    return request(`/words/lookup?word=${encodeURIComponent(word)}`, {
        method: "GET",
    });
}

export function saveVocabulary(wordData) {
    return request("/vocabulary", {
        method: "POST",
        body: JSON.stringify(wordData),
    });
}

export function getVocabulary() {
    return request("/vocabulary", {
        method: "GET",
    });
}

export function deleteVocabulary(id) {
    return request(`/vocabulary/${id}`, {
        method: "DELETE",
    });
}

export function checkVocabularySaved(word) {
    return request(`/vocabulary/check?word=${encodeURIComponent(word)}`, {
        method: "GET",
    });
}