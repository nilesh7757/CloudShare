"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });

      if (res.ok) {
        router.push("/login");
      } else {
        const data = await res.json();
        setError(data.message || "Something went wrong");
      }
    } catch (err) {
      setError("An error occurred");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-[#ededed]">
      <div className="w-full max-w-md p-8 bg-[#111] rounded-2xl border border-gray-800 shadow-2xl">
        <h1 className="text-3xl font-bold mb-2 text-center text-blue-500">CloudShare</h1>
        <p className="text-gray-500 text-center mb-8">Create your account to start sharing</p>
        
        {error && <p className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded-lg mb-6 text-sm text-center">{error}</p>}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-gray-500 uppercase font-semibold ml-1">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-500 transition"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500 uppercase font-semibold ml-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-500 transition"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500 uppercase font-semibold ml-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-500 transition"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-600/20"
          >
            Register
          </button>
        </form>
        <p className="mt-8 text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link href="/login" className="text-blue-500 hover:underline">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
