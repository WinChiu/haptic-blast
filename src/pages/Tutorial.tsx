import React from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const Tutorial: React.FC = () => {
  const navigate = useNavigate();

  const cards = [
    {
      title: "Preemptive title",
      button: "Something here",
    },
    {
      title: "Preemptive title",
      button: "And then here",
    },
    {
      title: "Preemptive title",
      button: "And lastly here",
    },
  ];

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-3 border-b border-neutral-800">
        <button
          onClick={() => navigate(-1)}
          className="-ml-2 rounded-full p-2 hover:bg-neutral-800 transition"
        >
          <ArrowLeft className="h-5 w-5 text-neutral-300" />
        </button>
        <h1 className="text-xl font-semibold">Haptics Tutorial</h1>
      </div>

      {/* Content cards */}
      <div className="flex-1 px-4 pb-6 space-y-6 mt-4">
        {cards.map((card) => (
          <div
            key={card.title}
            className="rounded-2xl border border-neutral-800 bg-neutral-800/60 px-4 py-4 space-y-3 backdrop-blur-sm shadow-md"
          >
            <h2 className="text-sm font-semibold text-neutral-200">
              {card.title}
            </h2>

            <p className="text-xs text-neutral-400 leading-relaxed">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis
              tempor, lorem vel viverra cursus, justo leo pretium orci, eu
              rhoncus dui mi a lorem. Integer posuere erat a ante.
            </p>

            <Button
              variant="secondary"
              className="w-full mt-1 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 border border-neutral-600"
            >
              {card.button}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Tutorial;