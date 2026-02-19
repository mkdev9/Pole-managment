/*
 * ============================================================
 *  PoleChart Component (Tailwind CSS)
 * ============================================================
 *  Recharts line chart for voltage/current trends per pole.
 *  Dual Y-axes, custom tooltip, overvoltage reference line.
 * ============================================================
 */

import React from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;

    return (
        <div className="bg-gray-900/95 border border-white/10 rounded-xl px-4 py-3 backdrop-blur-lg shadow-xl">
            <p className="text-slate-400 text-xs mb-2 font-sans">{label}</p>
            {payload.map((entry, i) => (
                <p key={i} className="text-sm font-semibold font-mono" style={{ color: entry.color }}>
                    {entry.name}: {parseFloat(entry.value).toFixed(2)} {entry.name === 'Voltage' ? 'V' : 'A'}
                </p>
            ))}
        </div>
    );
};

function PoleChart({ poleId, readings }) {
    const chartData = (readings || []).slice(-20).map((r, i) => ({
        time: r.timestamp || `#${i + 1}`,
        voltage: parseFloat(r.voltage) || 0,
        current: parseFloat(r.current) || 0,
    }));

    if (chartData.length < 2) {
        return (
            <div className="glass-card">
                <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-semibold text-slate-400">📈 Trends</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full border border-white/[0.08] text-slate-500 bg-white/[0.03]">
                        {poleId}
                    </span>
                </div>
                <div className="h-[180px] flex items-center justify-center text-slate-500 text-sm">
                    Waiting for more data points...
                </div>
            </div>
        );
    }

    return (
        <div className="glass-card">
            <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-semibold text-slate-400">📈 Voltage & Current Trends</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full border border-white/[0.08] text-slate-500 bg-white/[0.03]">
                    {poleId}
                </span>
            </div>

            <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.07)" />
                    <XAxis
                        dataKey="time"
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        axisLine={{ stroke: 'rgba(148, 163, 184, 0.1)' }}
                        tickLine={false}
                    />
                    <YAxis
                        yAxisId="voltage"
                        tick={{ fill: '#06b6d4', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        domain={['dataMin - 10', 'dataMax + 10']}
                    />
                    <YAxis
                        yAxisId="current"
                        orientation="right"
                        tick={{ fill: '#f59e0b', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        domain={[0, 'dataMax + 5']}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine
                        yAxisId="voltage"
                        y={260}
                        stroke="#f43f5e"
                        strokeDasharray="4 4"
                        strokeOpacity={0.5}
                        label={{ value: 'OV Limit', fill: '#f43f5e', fontSize: 9, position: 'insideTopRight' }}
                    />
                    <Line
                        yAxisId="voltage" type="monotone" dataKey="voltage"
                        stroke="#06b6d4" strokeWidth={2}
                        dot={false} activeDot={{ r: 4, fill: '#06b6d4' }}
                        name="Voltage"
                    />
                    <Line
                        yAxisId="current" type="monotone" dataKey="current"
                        stroke="#f59e0b" strokeWidth={2}
                        dot={false} activeDot={{ r: 4, fill: '#f59e0b' }}
                        name="Current"
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

export default PoleChart;
