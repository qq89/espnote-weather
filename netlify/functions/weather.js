exports.handler = async (event, context) => {
  // 获取你在 Netlify 设置里填写的环境变量
  const qweatherKey = process.env.QWEATHER_KEY;
  const qweatherHost = process.env.QWEATHER_HOST || "devapi.qweather.com";

  let days = [];
  let source = "";
  let success = false;

  // 1. 优先尝试和风天气
  if (qweatherKey) {
    try {
      const url = `https://${qweatherHost}/v7/weather/7d?location=118.2,39.6&key=${qweatherKey}`;
      const resp = await fetch(url);
      const data = await resp.json();
      
      if (data.code === "200" && data.daily) {
        source = "qweather";
        success = true;
        // 将和风的数据转换为前端需要的统一格式
        days = data.daily.map(d => {
          const icon = parseInt(d.iconDay);
          let dayCode = 3;
          if (icon === 100 || icon === 150) dayCode = 0;
          else if (icon >= 101 && icon <= 103) dayCode = 2;
          else if (icon >= 300 && icon <= 399) dayCode = 61;
          else if (icon >= 400 && icon <= 499) dayCode = 71;
          
          let nightCode = dayCode;
          const nIcon = parseInt(d.iconNight);
          if (nIcon === 150) nightCode = 0;
          
          return {
            date: d.fxDate,
            dayCode: dayCode,
            nightCode: nightCode,
            tmax: parseFloat(d.tempMax),
            tmin: parseFloat(d.tempMin),
            precip: parseFloat(d.precip) > 0 ? 100 : 0,
            windSpeed: parseFloat(d.windSpeedDay),
            windDir: parseInt(d.wind360Day)
          };
        });
      }
    } catch (e) {
      console.log("和风请求失败，准备降级", e);
    }
  }

  // 2. 如果和风失败，降级到 Open-Meteo
  if (!success) {
    try {
      source = "open-meteo";
      const url = `https://api.open-meteo.com/v1/forecast?latitude=39.6&longitude=118.2&hourly=weather_code,is_day&daily=wind_speed_10m_max,wind_direction_10m_dominant,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FShanghai&forecast_days=7`;
      const resp = await fetch(url);
      const data = await resp.json();
      
      if (data.daily) {
        const hourlyMap = {};
        for (let i = 0; i < data.hourly.time.length; i++) {
          const t = data.hourly.time[i];
          const dk = t.split('T')[0];
          if (!hourlyMap[dk]) hourlyMap[dk] = {day:[], night:[]};
          if (data.hourly.is_day[i] === 1) hourlyMap[dk].day.push(data.hourly.weather_code[i]);
          else hourlyMap[dk].night.push(data.hourly.weather_code[i]);
        }

        for (let i = 0; i < data.daily.time.length; i++) {
          const dk = data.daily.time[i];
          const h = hourlyMap[dk] || {day:[], night:[]};
          days.push({
            date: dk,
            dayCode: h.day.length ? Math.max.apply(null, h.day) : 3,
            nightCode: h.night.length ? Math.max.apply(null, h.night) : 3,
            tmax: data.daily.temperature_2m_max[i],
            tmin: data.daily.temperature_2m_min[i],
            precip: data.daily.precipitation_probability_max[i],
            windSpeed: data.daily.wind_speed_10m_max[i],
            windDir: data.daily.wind_direction_10m_dominant[i]
          });
        }
      }
    } catch (e) {
      console.log("备用天气也失败了", e);
    }
  }

  // 3. 返回给前端，并告诉 Netlify 缓存 1 小时 (3600秒)
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600" // 这就是你的缓存机制
    },
    body: JSON.stringify({ source: source, days: days })
  };
};