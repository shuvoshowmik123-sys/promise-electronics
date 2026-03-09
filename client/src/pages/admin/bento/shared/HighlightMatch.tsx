import * as React from "react";

interface HighlightMatchProps {
    text: string | number | null | undefined;
    query: string;
}

export function HighlightMatch({ text, query }: HighlightMatchProps) {
    if (text === null || text === undefined) return null;
    const strText = String(text);
    if (!query || query.trim() === "") return <>{strText}</>;

    const parts = strText.split(new RegExp(`(${query})`, 'gi'));
    return (
        <>
            {parts.map((part, index) =>
                part.toLowerCase() === query.toLowerCase() ? (
                    <mark key={index} className="bg-yellow-200/80 text-yellow-900 font-medium rounded-sm px-0.5">
                        {part}
                    </mark>
                ) : (
                    <span key={index}>{part}</span>
                )
            )}
        </>
    );
}
