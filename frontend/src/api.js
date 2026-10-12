import axios from "axios";
import { auth } from "./firebase";

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  async (config) => {
    try {
      const currentUser = auth.currentUser;
      const token = currentUser
        ? await currentUser.getIdToken()
        : localStorage.getItem("proxispeak-token");

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // Ignore token error and continue request
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default api;
