import React, { useRef } from "react";

export const LightThemes = {
  black: { mode: "light", border: "black", fill: "#edf400" },
  red: { mode: "light", border: "#fa1328", fill: "#bf011a" },
  blue: { mode: "light", border: "#7bd7ee", fill: "#01ace0" },
  pink: { mode: "light", border: "#f38dda", fill: "#fc2ab4" },
  gray: { mode: "light", border: "#a9a9a9", fill: "#696969" },
  green: { mode: "light", border: "#93dc86", fill: "#387f10" },
  orange: { mode: "light", border: "#fc9f2a", fill: "#fa6f01" },
  violet: { mode: "light", border: "#bbbbf4", fill: "#6952ac" },
  yellow: { mode: "light", border: "#f5d66f", fill: "#ebc400" },
};

export const DarkThemes = {
  black: { mode: "dark", border: "black", fill: "#edf400" },
  red: { mode: "dark", border: "#fa1328", fill: "#bf011a" },
  blue: { mode: "dark", border: "#7bd7ee", fill: "#01ace0" },
  pink: { mode: "dark", border: "#f38dda", fill: "#fc2ab4" },
  gray: { mode: "dark", border: "#a9a9a9", fill: "#696969" },
  green: { mode: "dark", border: "#93dc86", fill: "#387f10" },
  orange: { mode: "dark", border: "#fc9f2a", fill: "#fa6f01" },
  violet: { mode: "dark", border: "#bbbbf4", fill: "#6952ac" },
  yellow: { mode: "dark", border: "#f5d66f", fill: "#ebc400" },
};

Object.freeze(LightThemes);
Object.freeze(DarkThemes);

export function TimerFace({
  value,
  theme = LightThemes.gray,
  children,
  style,
  onValue = () => {},
}) {
  const radius = 90;
  const { border, fill } = theme;
  const dark = theme.mode === "dark";

  return (
    <SVGContainer divKids={children} style={style}>
      <Background border={border} dark={dark} radius={radius} onValue={onValue}>
        <Value value={value} fill={fill} dark={dark} />
      </Background>
    </SVGContainer>
  );
}

function Background({ border = "gray", dark, radius, children, onValue }) {
  const ref = useRef();

  const center = { x: 120, y: 120 };

  const toValue = (ev) => {
    const rect = ref.current.getBoundingClientRect();

    const x = ev.clientX - rect.x - rect.width / 2;
    const y = -(ev.clientY - rect.y - rect.height / 2);

    let angle = (Math.atan2(y, x) * 180) / Math.PI;

    angle = angle < 0 ? angle + 360 : angle;

    // 360° -> 60'
    //   x° -> x * 60' / 360°
    const value = (angle * 60) / 360 - 15;

    return Math.round(value < 0 ? 60 + value : value);
  };

  return (
    <>
      <rect
        x="10"
        y="10"
        rx={20}
        ry={20}
        width={220}
        height={220}
        fill="none"
        style={{ stroke: border, strokeWidth: 6 }}
      />

      <g
        ref={ref}
        onClick={(ev) => onValue(toValue(ev))}
        transform={`translate(${center.x}, ${center.y})`}
      >
        {children}

        <Ticks radius={radius} dark={dark} />
        <Minutes radius={radius} dark={dark} />
      </g>
    </>
  );
}

// dash-array length -> minutes
//   0 == 60'
//   1 == 59'
// 250 ==  1'
// 251 ==  0'
function Value({ dark, fill, value }) {
  const n = 251 - (251 / 60) * value;

  return (
    <>
      <circle
        r="70"
        cx="0"
        cy="0"
        fill={fill}
        stroke="none"
        strokeDasharray="170 186"
      />
      <g transform={`rotate(-90)`}>
        <circle
          r="40"
          cx="0"
          cy="0"
          fill="none"
          stroke={dark ? "#000" : "white"}
          strokeWidth="80"
          strokeDasharray={`${n} 286`}
        />
      </g>
    </>
  );
}

function Ticks({ dark, radius }) {
  return [...Array(60).keys()].map((i) => (
    <Tick key={i} dark={dark} i={i} radius={radius} />
  ));
}

function Minutes({ dark, radius }) {
  return [...Array(12).keys()].reduce(
    (acc, i) => {
      const x = Math.cos(acc.angle) * radius;
      const y = Math.sin(acc.angle) * radius + 6;

      acc.hours.push(
        <text
          key={i}
          x={x}
          y={y}
          fill={dark ? "white" : "#131011"}
          style={{ fontSize: 20, fontWeight: "bold" }}
          textAnchor="middle"
          alignmentBaseline="middle"
        >
          {i * 5}
        </text>
      );

      acc.angle -= Math.PI / 6;

      return acc;
    },
    { angle: -Math.PI / 2, hours: [] }
  ).hours;
}

function Tick({ dark, i, radius }) {
  return (
    <g key={i} transform={`rotate(${i * 6})`}>
      {i % 5 === 0 ? (
        <line
          x1={0}
          y1={radius - 15}
          x2={0}
          y2={radius - 23}
          style={{ stroke: dark ? "white" : "#12111a", strokeWidth: 1 }}
        />
      ) : (
        <line
          x1={0}
          y1={radius - 17}
          x2={0}
          y2={radius - 22}
          style={{ stroke: "#9d989e", strokeWidth: 1 }}
        />
      )}
    </g>
  );
}

function SVGContainer({ divKids, children, className, style }) {
  return (
    <div className={className} style={style}>
      <svg viewBox="0 0 240 240" preserveAspectRatio="xMidYMid meet">
        {children}
      </svg>
      {divKids}
    </div>
  );
}
