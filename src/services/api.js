const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

async function request(endpoint, options = {}) {
    const token = localStorage.getItem("token");
    const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
    };

    let response;
    try {
        response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers,
        });
    } catch (networkErr) {
        if (networkErr.name === "AbortError") {
            throw networkErr;
        }
        throw new Error("Unable to connect to ReadLingo server. Please check your connection.");
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        if (
            response.status === 401 &&
            !endpoint.startsWith("/auth/login") &&
            !endpoint.startsWith("/auth/signup")
        ) {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            if (window.location.pathname !== "/login" && window.location.pathname !== "/signup") {
                window.location.href = "/login";
            }
        }
        throw new Error(data.message || `Request failed with status ${response.status}`);
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

export function lookupWord(word, options = {}) {
    return request(`/words/lookup?word=${encodeURIComponent(word)}`, {
        method: "GET",
        ...options,
    });
}

export function getWordDefinition(word, options = {}) {
    return request(`/words/definition?word=${encodeURIComponent(word)}`, {
        method: "GET",
        ...options,
    });
}

export function getWordTranslation(word, options = {}) {
    return request(`/words/translate?word=${encodeURIComponent(word)}`, {
        method: "GET",
        ...options,
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

export function checkVocabularySaved(word, options = {}) {
    return request(`/vocabulary/check?word=${encodeURIComponent(word)}`, {
        method: "GET",
        ...options,
    });
}