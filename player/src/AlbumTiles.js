import React, { useEffect, useRef } from "react";

function bestFit(count, width, height) {
  const [small, large] = width < height ? [width, height] : [height, width]

  for (let perSmall = 1; perSmall <= count; perSmall++) {
    const size = Math.ceil(small / perSmall);
    const perLarge = Math.floor(large / size)

    if (perLarge * perSmall >= count) {
      const perRow = width < height ? perSmall : perLarge
      const perCol = Math.ceil(count / perRow)

      return { perRow, perCol, size }
    }
  }

  return { perRow: 4, perCol: 4, size: 10 }
}

function layout(container, size, perRow, perCol) {
  const rect = container.getBoundingClientRect();

  const xGap = Math.ceil((rect.width - perRow * size) / (perRow + 1))
  const yGap = Math.ceil((rect.height - perCol * size) / (perCol + 1))

  let x = rect.x + xGap
  let y = rect.y + yGap
  let rowCount = 0

  for (const child of container.children) {
    child.style.position = "fixed"
    child.style.left = `${x}px`
    child.style.top = `${y}px`

    child.style.width = `${size}px`

    rowCount++

    if (rowCount < perRow) {
      x += size + xGap
    } else {
      rowCount = 0

      x = rect.x + xGap
      y += size + yGap
    }
  };
}

const resize = (container, list) => {
  if (container === null) return

  const rect = container.getBoundingClientRect();

  if (rect.width === 0 || rect.height === 0) {
    console.error("Why container is 0 sized?", rect);
    return
  }

  const { perRow, perCol, size } = bestFit(list.length, rect.width, rect.height)

  layout(container, size, perRow, perCol)
}

const styles = {
  overflow: "hidden",
  width: "100%",
  height: "100%"
}

export function AlbumTiles({ list, onClick }) {
  const container = useRef()

  useEffect(() => {
    const onResize = (entries) => {
      const container = entries[0].target;

      resize(container, list);
    }

    new ResizeObserver(onResize).observe(container.current);
  }, [list])

  return <div ref={container} style={styles}>
    {list.map((playlist, i) => <img key={i} alt="" src={playlist.image} onClick={() => onClick(i)} />)}
  </div>

}

