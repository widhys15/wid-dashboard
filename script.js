// Time update function
function updateTime() {
    const currentTimeElement = document.getElementById("current-time");
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, "0");
    const minutes = now.getMinutes().toString().padStart(2, "0");
    const seconds = now.getSeconds().toString().padStart(2, "0");
    const currentTime = `${hours}:${minutes}:${seconds}`;
    currentTimeElement.textContent = currentTime;
}

// Update time every second
updateTime();
setInterval(updateTime, 1000);

// Fetch cryptocurrency prices
async function fetchCryptoPrices() {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,binancecoin&order=market_cap_desc&per_page=3&page=1&sparkline=false&price_change_percentage=24h');
        const data = await response.json();
        
        // Update Bitcoin
        const bitcoin = data.find(coin => coin.id === 'bitcoin');
        if (bitcoin) {
            document.getElementById('btc-price').textContent = bitcoin.current_price.toLocaleString();
            const btcChange = document.getElementById('btc-change');
            btcChange.textContent = bitcoin.price_change_percentage_24h.toFixed(2) + '%';
            btcChange.className = bitcoin.price_change_percentage_24h >= 0 ? 'positive' : 'negative';
        }
        
        // Update Ethereum
        const ethereum = data.find(coin => coin.id === 'ethereum');
        if (ethereum) {
            document.getElementById('eth-price').textContent = ethereum.current_price.toLocaleString();
            const ethChange = document.getElementById('eth-change');
            ethChange.textContent = ethereum.price_change_percentage_24h.toFixed(2) + '%';
            ethChange.className = ethereum.price_change_percentage_24h >= 0 ? 'positive' : 'negative';
        }
        
    } catch (error) {
        console.error('Error fetching crypto prices:', error);
    }
}

// Fetch business news
async function fetchBusinessNews() {
    try {
        // Using News API for business news
        const apiKey = '__NEWSAPI_KEY__'; // Placeholder that will be replaced during deployment
        const response = await fetch(`https://newsapi.org/v2/top-headlines?category=business&language=en&apiKey=${apiKey}`);
        const data = await response.json();
        
        console.log("Business News API Response:", data); // Debug log
        
        const newsContainer = document.getElementById('business-news');
        newsContainer.innerHTML = '';
        
        if (data.status === 'ok' && data.articles && data.articles.length > 0) {
            // Display up to 5 news articles
            const articles = data.articles.slice(0, 5);
            articles.forEach(article => {
                // Get the image if available
                let imageUrl = 'https://via.placeholder.com/120x75?text=No+Image'; // Updated placeholder size
                if (article.urlToImage) {
                    imageUrl = article.urlToImage;
                }
                
                const newsItem = document.createElement('div');
                newsItem.className = 'news-item';
                
                newsItem.innerHTML = `
                    <img src="${imageUrl}" alt="${article.title}">
                    <div class="news-content">
                        <h3><a href="${article.url}" target="_blank">${article.title}</a></h3>
                        <p>${article.description || 'No description available'}</p>
                        <span class="news-source">${article.source.name} - ${new Date(article.publishedAt).toLocaleDateString()}</span>
                    </div>
                `;
                
                newsContainer.appendChild(newsItem);
            });
        } else {
            newsContainer.innerHTML = '<p>No news articles available at the moment.</p>';
        }
        
    } catch (error) {
        console.error('Error fetching business news:', error);
        document.getElementById('business-news').innerHTML = '<p>Failed to load news. Please try again later.</p>';
    }
}

// Fetch technology news
async function fetchTechNews() {
    try {
        // Using News API for technology news
        const apiKey = '__NEWSAPI_KEY__'; // Placeholder that will be replaced during deployment
        const response = await fetch(`https://newsapi.org/v2/top-headlines?category=technology&language=en&apiKey=${apiKey}`);
        const data = await response.json();
        
        console.log("Tech News API Response:", data); // Debug log
        
        const newsContainer = document.getElementById('tech-news');
        newsContainer.innerHTML = '';
        
        if (data.status === 'ok' && data.articles && data.articles.length > 0) {
            // Display up to 5 news articles
            const articles = data.articles.slice(0, 5);
            articles.forEach(article => {
                // Get the image if available
                let imageUrl = 'https://via.placeholder.com/120x75?text=No+Image'; // Updated placeholder size
                if (article.urlToImage) {
                    imageUrl = article.urlToImage;
                }
                
                const newsItem = document.createElement('div');
                newsItem.className = 'news-item';
                
                newsItem.innerHTML = `
                    <img src="${imageUrl}" alt="${article.title}">
                    <div class="news-content">
                        <h3><a href="${article.url}" target="_blank">${article.title}</a></h3>
                        <p>${article.description || 'No description available'}</p>
                        <span class="news-source">${article.source.name} - ${new Date(article.publishedAt).toLocaleDateString()}</span>
                    </div>
                `;
                
                newsContainer.appendChild(newsItem);
            });
        } else {
            newsContainer.innerHTML = '<p>No news articles available at the moment.</p>';
        }
        
    } catch (error) {
        console.error('Error fetching tech news:', error);
        document.getElementById('tech-news').innerHTML = '<p>Failed to load news. Please try again later.</p>';
    }
}

// Google Search functionality
function setupSearch() {
    const searchInput = document.getElementById('search-input');
    
    // Auto-focus the search input when page loads
    searchInput.focus();
    
    // Function to perform search
    function performSearch() {
        const query = searchInput.value.trim();
        if (query) {
            let searchUrl = 'https://www.google.com/search?q=' + encodeURIComponent(query);
            window.open(searchUrl, '_blank');
        }
    }
    
    // Event listener for Enter key in search input
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
}

// Initialize the page
window.onload = function() {
    // Fetch crypto prices and news
    fetchCryptoPrices();
    fetchBusinessNews();
    fetchTechNews();
    
    // Setup search functionality (includes auto-focus)
    setupSearch();
    
    // Update crypto prices every 60 seconds
    setInterval(fetchCryptoPrices, 60000);
    
    // Update news every 30 minutes
    setInterval(fetchBusinessNews, 1800000);
    setInterval(fetchTechNews, 1800000);
};