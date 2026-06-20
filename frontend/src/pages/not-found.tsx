import { Link } from "wouter";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#F8FAFC]">
      <div className="bg-white rounded-2xl shadow-lg p-12 max-w-md mx-4 text-center">
        <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-[#0B1F3A] mb-2">404</h1>
        <p className="text-gray-500 mb-8">This page doesn't exist.</p>
        <Link href="/">
          <button className="bg-[#0B1F3A] text-white rounded-full px-8 py-3 font-semibold hover:bg-[#0B1F3A]/90 transition-colors">
            Go Home
          </button>
        </Link>
      </div>
    </div>
  );
}
